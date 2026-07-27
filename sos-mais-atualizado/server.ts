import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import admin from "firebase-admin";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY,
}) : null;

// Initialize Firebase Admin
try {
  const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  let serviceAccount = null;

  if (saEnv) {
    if (saEnv.trim().startsWith('{')) {
      try {
        serviceAccount = JSON.parse(saEnv);
      } catch (e) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:", e);
      }
    } else {
      console.warn("FIREBASE_SERVICE_ACCOUNT does not look like a JSON object.");
    }
  }

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin initialized with service account.");
  } else {
    // If running in Google Cloud, it might use Application Default Credentials
    // But we avoid auto-init if we suspect it might fail or if we want to be explicit
    // admin.initializeApp(); 
    console.log("Firebase Admin not initialized (no service account). Push notifications restricted to local.");
  }
} catch (error) {
  console.warn("Firebase Admin failed to initialize.", error);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing JSON
  app.use(express.json());

  // === CORS ===
  // Origens permitidas: o site web (definido em ALLOWED_ORIGIN, para produção),
  // localhost em desenvolvimento, e os esquemas nativos que o Capacitor usa
  // para servir a app dentro do WebView do iOS/Android.
  const allowedOrigins = [
    process.env.ALLOWED_ORIGIN, // ex: https://sosmais.pt — define isto em produção
    "http://localhost:3000",
    "http://localhost:5173",
    "capacitor://localhost", // iOS (Capacitor)
    "https://localhost",     // Android (Capacitor, esquema https por defeito)
    "http://localhost"       // Android (fallback)
  ].filter(Boolean) as string[];

  app.use(cors({
    origin: (origin, callback) => {
      // Pedidos sem "Origin" (ex: apps nativas via fetch nativo, curl, health checks)
      // são permitidos — não há política de mesma-origem para os bloquear de qualquer forma.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Origem bloqueada: ${origin}`);
        callback(new Error("Não permitido por CORS"));
      }
    },
    credentials: true
  }));

  // === CABEÇALHOS DE SEGURANÇA HTTP ===
  // CSP configurada com base num levantamento real de todos os domínios que a app
  // efetivamente contacta a partir do browser (mapas, fontes, Firebase, APIs de
  // terceiros). Se adicionares uma nova API/serviço externo no frontend, lembra-te
  // de o acrescentar aqui também, ou o browser vai bloquear o pedido.
  const isDev = process.env.NODE_ENV !== "production";

  app.use(helmet({
    // CSP estrita só faz sentido em produção: em desenvolvimento, o Vite injeta
    // um script inline e usa WebSocket para o hot-reload, e uma CSP rígida
    // bloqueia os dois, impedindo a app de sequer arrancar.
    contentSecurityPolicy: isDev ? false : {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // 'unsafe-inline' aqui é necessário: bibliotecas de UI (react-hot-toast/goober)
        // injetam <style> dinamicamente; não há forma fácil de evitar sem reescrever essas libs.
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: [
          "'self'", "data:", "blob:",
          "https://*.tile.openstreetmap.org",
          "https://www.openstreetmap.org"
        ],
        connectSrc: [
          "'self'",
          // Localização/IP (fallback chain do ipLocationService)
          "https://ipwho.is", "https://ipapi.co",
          // Meteorologia
          "https://api.open-meteo.com", "https://api.ipma.pt",
          // Pontos de emergência (OSM Overpass — vários espelhos, com fallback)
          "https://overpass-api.de", "https://lz4.overpass-api.de", "https://z.overpass-api.de",
          "https://overpass.kumi.systems", "https://overpass.osm.ch", "https://overpass.openstreetmap.fr",
          "https://overpass.be", "https://overpass.nchc.org.tw", "https://overpass.oz.org.au",
          // Geocodificação inversa
          "https://nominatim.openstreetmap.org",
          // Sons de UI
          "https://assets.mixkit.co", "https://cdn.freesound.org",
          // Firebase (Auth, Firestore, Cloud Messaging) — inclui endpoints internos do SDK
          // que não aparecem no nosso código-fonte (ex: renovação de tokens).
          "https://firestore.googleapis.com", "https://identitytoolkit.googleapis.com",
          "https://securetoken.googleapis.com", "https://www.googleapis.com",
          "https://firebaseinstallations.googleapis.com", "https://fcm.googleapis.com",
          "https://apis.google.com",
          "wss://*.firebaseio.com", "https://*.firebaseio.com",
          // Google Maps / Places (se vieres a usar o SDK diretamente no cliente)
          "https://maps.googleapis.com", "https://places.googleapis.com"
        ],
        frameSrc: ["'self'", "https://apis.google.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"]
      }
    }
  }));

  // === VERIFICAÇÃO DE IDENTIDADE (evita spoofing de userId) ===
  // Extrai e valida o ID token do Firebase Auth enviado em "Authorization: Bearer <token>".
  // Retorna o UID verificado (nunca o que vem no corpo do pedido) ou null se inválido/ausente.
  async function verifyAuthUid(req: express.Request): Promise<string | null> {
    try {
      const header = req.headers.authorization;
      if (!header || !header.startsWith("Bearer ")) return null;
      const idToken = header.slice(7);
      const decoded = await admin.auth().verifyIdToken(idToken);
      return decoded.uid;
    } catch (e) {
      return null;
    }
  }

  // === PROTEÇÃO CONTRA ABUSO (Rate Limiting) ===
  // Limite geral: protege o servidor de ser inundado com pedidos
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    limit: 300, // até 300 pedidos por IP nesse intervalo
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiados pedidos. Por favor, aguarde um pouco e tente novamente." }
  });
  app.use("/api/", generalLimiter);

  // Limite mais apertado: protege especificamente a IA (Groq), que é o recurso mais caro/sensível
  const aiChatLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutos
    limit: 20, // até 20 perguntas por IP nesse intervalo (generoso para uso normal, impede abuso automatizado)
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Atingiste o limite de perguntas à IA por agora. Aguarda alguns minutos." }
  });
  app.use("/api/chat", aiChatLimiter);

  // === SOS SYSTEM ENDPOINTS ===

  /**
   * Reverse Geocoding with local caching
   */
  const geoCache = new Map<string, { data: any, timestamp: number }>();
  app.get("/api/geocode", async (req, res) => {
    try {
      const { lat, lon } = req.query;
      if (!lat || !lon) return res.status(400).json({ error: "Missing lat/lon" });

      const cacheKey = `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
      const cached = geoCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour cache
        return res.json(cached.data);
      }

      // Try Nominatim first
      let response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {
        headers: {
          'User-Agent': 'SOS-MAIS-Emergency-App/1.0 (Emergency Geolocation Fallback)'
        },
        signal: AbortSignal.timeout(5000)
      });
      
      // Try BigDataCloud if Nominatim fails or if we have a key
      const bdcKey = process.env.BIGDATACLOUD_API_KEY;
      if ((!response.ok || response.status === 429) && bdcKey && bdcKey !== "MY_BDC_API_KEY") {
        console.log("[Geocode] Nominatim busy, trying BigDataCloud...");
        try {
          const bdcResponse = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode?latitude=${lat}&longitude=${lon}&localityLanguage=pt&key=${bdcKey}`, {
            signal: AbortSignal.timeout(4000)
          });
          if (bdcResponse.ok) response = bdcResponse;
        } catch (e) {
          console.warn("[Geocode] BigDataCloud failed");
        }
      }

      // Secondary fallback if others fail
      if (!response.ok || response.status === 429) {
        console.log("[Geocode] Primary geocoders busy, trying geodescription...");
        try {
          const geoDescResponse = await fetch(`https://free.geodescription.com/text/lat=${lat}/lon=${lon}`, {
            signal: AbortSignal.timeout(4000)
          });
          if (geoDescResponse.ok) {
            const text = await geoDescResponse.text();
            return res.json({ display_name: text });
          }
        } catch (e) {
          console.warn("[Geocode] Geodescription failed");
        }
      }

      // 3. Try Geokeo if others fail
      if (!response.ok || response.status === 429) {
        console.log("[Geocode] Trying Geokeo...");
        try {
          const geokeoKey = process.env.GEOKEO_API_KEY;
          if (geokeoKey) {
            const geokeoResponse = await fetch(`https://geokeo.com/geocode/v1/reverse.php?lat=${lat}&lng=${lon}&api=${geokeoKey}`, {
              signal: AbortSignal.timeout(4000)
            });
            if (geokeoResponse.ok) {
              const data = await geokeoResponse.json();
              if (data.results && data.results[0]) {
                return res.json({ display_name: data.results[0].formatted_address });
              }
            }
          }
        } catch (e) {
          console.warn("[Geocode] Geokeo failed");
        }
      }

      // 4. Try LocationIQ if others fail
      if (!response.ok || response.status === 429) {
        console.log("[Geocode] Trying LocationIQ...");
        try {
          const liqKey = process.env.LOCATIONIQ_API_KEY;
          if (liqKey) {
            const liqResponse = await fetch(`https://us1.locationiq.com/v1/reverse?key=${liqKey}&lat=${lat}&lon=${lon}&format=json`, {
              signal: AbortSignal.timeout(4000)
            });
            if (liqResponse.ok) {
              const data = await liqResponse.json();
              if (data.display_name) {
                return res.json(data);
              }
            }
          }
        } catch (e) {
          console.warn("[Geocode] LocationIQ failed");
        }
      }

      // Final fallback if others fail

      if (!response.ok) throw new Error("Geocoding services unavailable");
      
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Geocoding service returned non-JSON response");
      }

      const data = await response.json();
      geoCache.set(cacheKey, { data, timestamp: Date.now() });
      res.json(data);
    } catch (error) {
      console.warn("Geocode Error (Nominatim failed, using fallback):", error);
      // Fallback: Return a synthetic address if the real service fails
      const fallbackData = {
        name: "Posição GPS Detectada",
        display_name: `Coordenadas: ${Number(req.query.lat).toFixed(5)}, ${Number(req.query.lon).toFixed(5)}`,
        address: {
          road: "Posição GPS Detectada",
          city: "Portal SOS+",
          country: "Portugal"
        }
      };
      res.json(fallbackData);
    }
  });

  /**
   * Elevation Data API (Powered by OpenTopoData)
   * Useful for terrain risk analysis (flooding, accessibility)
   */
  const elevationCache = new Map<string, { data: any, timestamp: number }>();
  app.get("/api/elevation", async (req, res) => {
    try {
      const { lat, lon, dataset = "test-dataset" } = req.query;
      if (!lat || !lon) return res.status(400).json({ error: "Lat/Lon required" });

      const cacheKey = `${lat},${lon},${dataset}`;
      const entry = elevationCache.get(cacheKey);
      if (entry && Date.now() - entry.timestamp < 1000 * 60 * 60 * 24) { // 24h cache
        return res.json(entry.data);
      }

      const response = await fetch(`https://api.opentopodata.org/v1/${dataset}?locations=${lat},${lon}`, {
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) throw new Error("Elevation service unavailable");
      const data = await response.json();
      
      if (data.status === "OK" && data.results && data.results[0]) {
        const result = {
          elevation: data.results[0].elevation,
          location: data.results[0].location,
          dataset: data.results[0].dataset
        };
        elevationCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return res.json(result);
      }
      
      res.status(500).json({ error: "Failed to retrieve elevation" });
    } catch (error) {
      console.error("Elevation Error:", error);
      res.status(500).json({ error: "Falha ao obter dados de elevação" });
    }
  });

  /**
   * Water Detection API (Powered by IsItWater)
   * Checks if coordinates are over water or land.
   */
  app.get("/api/is-water", async (req, res) => {
    try {
      const { lat, lon } = req.query;
      if (!lat || !lon) return res.status(400).json({ error: "Lat/Lon required" });

      const apiKey = process.env.ISITWATER_API_KEY;
      const headers: any = { "Accept": "application/json" };
      if (apiKey && apiKey !== "YOUR_API_KEY") {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const response = await fetch(`https://api.isitwater.com/v1/locations/water?latitude=${lat}&longitude=${lon}`, {
        headers,
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn("IsItWater API error:", errText);
        return res.status(response.status).json({ error: "Water check service unavailable" });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Is-Water Error:", error);
      res.status(500).json({ error: "Falha ao verificar presença de água" });
    }
  });

  /**
   * Databricks Jobs API
   * Orchestrates high-compute tasks like nightly model training for risk prediction.
   */
  app.post("/api/databricks/jobs", async (req, res) => {
    try {
      const host = process.env.DATABRICKS_HOST;
      const token = process.env.DATABRICKS_TOKEN;

      if (!host || !token) {
        return res.status(403).json({ error: "Databricks credentials not configured" });
      }

      const response = await fetch(`${host}/api/2.1/jobs/create`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn("Databricks API error:", errText);
        return res.status(response.status).json({ error: "Job orchestration service unavailable" });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Databricks Error:", error);
      res.status(500).json({ error: "Falha ao orquestrar tarefa de treinamento" });
    }
  });

  app.get("/api/databricks/jobs", async (req, res) => {
    try {
      const host = process.env.DATABRICKS_HOST;
      const token = process.env.DATABRICKS_TOKEN;

      if (!host || !token) {
        return res.status(403).json({ error: "Databricks credentials not configured" });
      }

      const response = await fetch(`${host}/api/2.1/jobs/list?limit=10`, {
        headers: { "Authorization": `Bearer ${token}` },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) throw new Error("Could not fetch jobs");
      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Falha ao listar tarefas" });
    }
  });

  /**
   * Databricks AI Model Serving
   * Proxies requests to hosted foundation models (e.g. Claude 3.7 Sonnet)
   */
  app.post("/api/ai/databricks", express.json(), async (req, res) => {
    try {
      const host = process.env.DATABRICKS_HOST;
      const token = process.env.DATABRICKS_TOKEN;
      const { messages, model = "databricks-claude-3-7-sonnet", temperature = 0.7 } = req.body;

      if (!host || !token) {
        return res.status(403).json({ error: "Databricks credentials not configured" });
      }

      // Databricks serving endpoints for Foundation Models usually follow OpenAI format
      const response = await fetch(`${host}/serving-endpoints/${model}/invocations`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages,
          temperature,
          max_tokens: 1000
        }),
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn("Databricks Model Error:", errText);
        return res.status(response.status).json({ error: "Advanced AI service unavailable" });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Databricks AI Error:", error);
      res.status(500).json({ error: "Falha no motor de IA avançado" });
    }
  });

  /**
   * Register or update a device token for a user
   */
  app.post("/api/notifications/register", async (req, res) => {
    try {
      const { userId, token, deviceType, latitude, longitude } = req.body;
      if (!userId || !token) return res.status(400).json({ error: "Missing data" });

      // Evita que alguém registe/substitua o token de notificações de outra pessoa.
      const verifiedUid = await verifyAuthUid(req);
      if (!verifiedUid || verifiedUid !== userId) {
        return res.status(401).json({ error: "Não autorizado: sessão inválida ou userId não corresponde ao utilizador autenticado." });
      }

      // Save token to Firestore for the user
      // We store it in a subcollection of the user for multi-device support
      const tokenRef = admin.firestore().collection("users").doc(userId).collection("tokens").doc(token);
      await tokenRef.set({
        token,
        deviceType: deviceType || 'web',
        ...(typeof latitude === 'number' && typeof longitude === 'number' ? { latitude, longitude } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      res.json({ success: true });
    } catch (error) {
      console.error("Register Token Error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  /**
   * SOS Trigger: Notifies all emergency contacts of a user
   */
  app.post("/api/sos", async (req, res) => {
    try {
      const { userId, latitude, longitude, address } = req.body;
      if (!userId) return res.status(400).json({ error: "User ID required" });

      // Confirma que quem está a pedir é mesmo o dono deste userId — evita SOS falsos
      // disparados por terceiros que só conheçam/adivinhem o ID de outra pessoa.
      const verifiedUid = await verifyAuthUid(req);
      if (!verifiedUid || verifiedUid !== userId) {
        return res.status(401).json({ error: "Não autorizado: sessão inválida ou userId não corresponde ao utilizador autenticado." });
      }

      const mapsLink = `https://www.google.com/maps?q=${latitude},${longitude}`;
      
      // 1. Get User info
      const userDoc = await admin.firestore().collection("users").doc(userId).get();
      const userData = userDoc.data();
      const userName = userData?.fullName || "Um utilizador";

      // 2. Get User's Emergency Contacts
      const contactsSnap = await admin.firestore()
        .collection("users")
        .doc(userId)
        .collection("contacts")
        .get();

      const notificationPromises: Promise<any>[] = [];

      // 3. For each contact, send alert
      // Note: In a real scenario, we'd find the contact's userId to get their tokens
      // For this implementation, if the contact has a stored FCM token, we use it directly
      for (const doc of contactsSnap.docs) {
        const contact = doc.data();
        if (contact.fcmToken) {
          notificationPromises.push(
            admin.messaging().send({
              token: contact.fcmToken,
              notification: {
                title: "🚨 SOS: " + userName,
                body: `EMERGÊNCIA! Localização: ${mapsLink || 'Abrir App'}`
              },
              data: {
                latitude: String(latitude),
                longitude: String(longitude),
                mapsLink,
                type: "emergency_sos"
              },
              android: { priority: "high" }
            }).catch(e => console.warn(`Failed to notify contact ${contact.name}:`, e))
          );
        }
      }

      // Also send to the user themselves as confirmation
      const userTokensSnap = await admin.firestore()
        .collection("users")
        .doc(userId)
        .collection("tokens")
        .get();
      
      userTokensSnap.forEach(tDoc => {
        const tData = tDoc.data();
        notificationPromises.push(
          admin.messaging().send({
            token: tData.token,
            notification: {
              title: "🆘 SOS COMPARTILHADO",
              body: "O seu alerta foi enviado para os seus contactos de emergência."
            },
            android: { priority: "high" }
          }).catch(() => {})
        );
      });

      await Promise.all(notificationPromises);

      res.json({ 
        success: true, 
        notifiedCount: notificationPromises.length,
        mapsLink 
      });
    } catch (error) {
      console.error("SOS Trigger Error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // FCM Sending Endpoint (Legacy/Test)
  app.post("/api/notifications/send", async (req, res) => {
    try {
      const { token, title, body, data } = req.body;
      
      const message = {
        notification: { title, body },
        token: token,
        data: data || {},
        android: {
          priority: "high" as const,
          notification: {
            channelId: "sos-emergency",
            priority: "max" as const,
            sound: "default",
          }
        },
        apns: {
          payload: {
            aps: {
              alert: { title, body },
              sound: "default",
              contentAvailable: true,
            }
          }
        }
      };

      const response = await admin.messaging().send(message);
      res.json({ success: true, response });
    } catch (error) {
      console.error("FCM Error:", error);
      res.status(500).json({ success: false, error: String(error) });
    }
  });

  // VAPID Key helper
  app.get("/api/notifications/config", (req, res) => {
    res.json({
      vapidKey: process.env.FIREBASE_VAPID_KEY || ""
    });
  });

  // Cache for alerts
  let cachedAlerts: any[] = [];
  let lastFetchTime = 0;
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Distância em km entre duas coordenadas (fórmula de Haversine)
  function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  const PUSH_NEAR_KM = 50;
  const MAX_PUSH_PER_USER_PER_CYCLE = 2;
  // Em memória: fireId -> Set de tokens já notificados. Evita repetir o mesmo alerta.
  // (Reinicia se o servidor reiniciar — aceitável, só causa no pior caso 1 notificação a mais.)
  const notifiedTokensByFire = new Map<string, Set<string>>();

  /**
   * Percorre os dispositivos registados com localização conhecida e envia push
   * apenas para os alertas críticos dentro de PUSH_NEAR_KM, no máximo
   * MAX_PUSH_PER_USER_PER_CYCLE por utilizador — mesmo critério usado no cliente.
   */
  async function notifyNearbyUsersOfCriticalAlerts(alerts: any[]) {
    try {
      const relevantAlerts = alerts.filter(a => a.severity === 'high' || a.severity === 'medium');
      if (relevantAlerts.length === 0) return;

      const tokensSnap = await admin.firestore().collectionGroup("tokens").get();

      for (const tokenDoc of tokensSnap.docs) {
        const data = tokenDoc.data();
        if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number' || !data.token) continue;

        const nearby = relevantAlerts
          .map(alert => ({ alert, distance: distanceKm(data.latitude, data.longitude, alert.location.lat, alert.location.lng) }))
          .filter(({ alert, distance }) => {
            // Crítico até PUSH_NEAR_KM, ou Importante até metade desse raio.
            const inRange = alert.severity === 'high' ? distance <= PUSH_NEAR_KM : distance <= PUSH_NEAR_KM / 2;
            if (!inRange) return false;
            const notified = notifiedTokensByFire.get(alert.id);
            return !notified || !notified.has(data.token);
          })
          .sort((a, b) => {
            const rank = (s: string) => s === 'high' ? 0 : 1;
            const rankDiff = rank(a.alert.severity) - rank(b.alert.severity);
            return rankDiff !== 0 ? rankDiff : a.distance - b.distance;
          })
          .slice(0, MAX_PUSH_PER_USER_PER_CYCLE);

        for (const { alert, distance } of nearby) {
          try {
            await admin.messaging().send({
              token: data.token,
              notification: {
                title: `⚠️ ${alert.severity === 'high' ? 'CRÍTICO' : 'IMPORTANTE'} PERTO DE SI: ${alert.title}`,
                body: `A ${distance.toFixed(1)}km. ${alert.description}`
              },
              data: { type: 'critical_alert', alertId: alert.id },
              android: { priority: "high" },
              webpush: { fcmOptions: { link: "/" } }
            });
            if (!notifiedTokensByFire.has(alert.id)) notifiedTokensByFire.set(alert.id, new Set());
            notifiedTokensByFire.get(alert.id)!.add(data.token);
          } catch (e) {
            console.warn(`Falha ao enviar push para token ${tokenDoc.id}:`, e);
          }
        }
      }
    } catch (error) {
      console.error("Erro ao notificar utilizadores próximos:", error);
    }
  }

  async function fetchAllAlerts() {
    try {
      const fogosToken = process.env.FOGOS_API_TOKEN;
      const firmsKey = process.env.FIRMS_MAP_KEY;
      // Bounding box de Portugal continental: west,south,east,north
      const PT_BBOX = "-9.6,36.9,-6.1,42.2";
      const [seismicRes, warningsRes, firesRes, fogosPtRes, firmsRes] = await Promise.allSettled([
        fetch("https://api.ipma.pt/open-data/observation/seismic/7.json"),
        fetch("https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json"),
        fetch("https://fogosagora.pt/api/anepc/fires", {
          headers: { "User-Agent": "SOS-Mais-Emergency-App/1.0" }
        }),
        fogosToken
          ? fetch("https://api.fogos.pt/new/fires", {
              headers: {
                "FOGOS-PT-AUTH": fogosToken,
                "User-Agent": "SOS-Mais-Emergency-App/1.0"
              }
            })
          : Promise.reject("No Fogos Token"),
        firmsKey
          ? Promise.all([
              fetch(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/VIIRS_SNPP_NRT/${PT_BBOX}/1`).then(r => r.text()).catch(() => ''),
              fetch(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/VIIRS_NOAA20_NRT/${PT_BBOX}/1`).then(r => r.text()).catch(() => ''),
              fetch(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/VIIRS_NOAA21_NRT/${PT_BBOX}/1`).then(r => r.text()).catch(() => ''),
              fetch(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/MODIS_NRT/${PT_BBOX}/1`).then(r => r.text()).catch(() => '')
            ])
          : Promise.reject("No FIRMS Key")
      ]);

      const alerts: any[] = [];

      // Process Seismic
      if (seismicRes.status === 'fulfilled' && seismicRes.value.ok) {
        const data = await seismicRes.value.json();
        const events = data.data || [];
        events.slice(0, 10).forEach((event: any) => {
          const mag = parseFloat(event.magValue || event.mag || event.magnitude || 0);
          const depth = event.depth !== undefined && event.depth !== null ? event.depth : 'N/A';
          const region = event.region || event.local || 'Zona Desconhecida';
          
          if (!isNaN(mag)) {
            alerts.push({
              id: `seismic-${event.id || Math.random()}`,
              title: `Sismo: ${region}`,
              description: `Magnitude ${mag.toFixed(1)} detectada a ${depth}km de profundidade.`,
              severity: mag > 4.5 ? 'high' : mag > 3.0 ? 'medium' : 'low',
              type: 'seismic',
              location: { lat: event.lat, lng: event.lon },
              timestamp: new Date(event.time)
            });
          }
        });
      }

      // Process Warnings
      if (warningsRes.status === 'fulfilled' && warningsRes.value.ok) {
        const data = await warningsRes.value.json();
        const warnings = Array.isArray(data) ? data : (data.data || []);
        warnings.forEach((w: any) => {
          const awarenessType = w.awarenessTypeName || '';
          const isHeat = awarenessType.toLowerCase().includes('quente');
          const isCold = awarenessType.toLowerCase().includes('frio');
          const title = isHeat ? '🌡️ Temperatura Extrema: Calor'
                      : isCold ? '🌡️ Temperatura Extrema: Frio'
                      : `Aviso: ${awarenessType || 'Meteorologia'}`;

          alerts.push({
            id: `warning-${w.idArea || Math.random()}-${w.startTime}`,
            title,
            description: `${w.awarenessLevelName}: ${w.text || 'Condições meteorológicas adversas.'}`,
            // Nível oficial do IPMA já reflete a gravidade real da temperatura para a região:
            // vermelho = perigo extremo, laranja = perigo importante, amarelo/verde = vigilância.
            severity: w.awarenessLevelName?.toLowerCase().includes('vermelho') ? 'high' : 
                      w.awarenessLevelName?.toLowerCase().includes('laranja') ? 'medium' : 'low',
            type: 'weather',
            location: { lat: 39.5, lng: -8.0 },
            timestamp: new Date(w.startTime || Date.now())
          });
        });
      }

      // Process Fires (fogosagora.pt — público, sem token — fonte principal)
      const seenFireIds = new Set<string>();
      try {
        if (firesRes.status === 'fulfilled' && firesRes.value.ok) {
          const data = await firesRes.value.json();
          const fires = data.active || [];
          fires.forEach((fire: any) => {
            seenFireIds.add(String(fire.id));
            const locationLabel = [fire.freguesia, fire.concelho, fire.district].filter(Boolean).join(', ');
            alerts.push({
              id: `fire-${fire.id}`,
              title: `Incêndio: ${locationLabel || fire.localidade || 'Localização desconhecida'}`,
              description: `Status: ${fire.status}. Operacionais: ${fire.groundOperatives ?? 0} | Veículos: ${fire.groundVehicles ?? 0} | Aéreos: ${fire.aerialVehicles ?? 0}`,
              severity: (fire.groundOperatives ?? 0) > 100 || (fire.aerialVehicles ?? 0) > 5 ? 'high' : (fire.groundOperatives ?? 0) > 20 ? 'medium' : 'low',
              type: 'fire',
              location: { lat: fire.latitude, lng: fire.longitude },
              // Só lemos data.active — enquanto aparecer aqui, está mesmo em curso.
              isActive: true,
              // Usa a última atualização (não a data de início) — um incêndio de dias que continua
              // ativo é atualizado a cada ciclo pela ANEPC, por isso a "idade" mantém-se baixa.
              timestamp: new Date(fire.feedLastUpdated || fire.occurredAt)
            });
          });
        }
      } catch (e) {
        console.error("[Alerts] Falha ao processar fogosagora.pt (fonte ignorada nesta atualização):", e);
      }

      // Process Fires (api.fogos.pt — fonte secundária, só adiciona o que a fogosagora.pt não tinha)
      try {
        if (fogosPtRes.status === 'fulfilled' && (fogosPtRes.value as Response).ok) {
          const data = await (fogosPtRes.value as Response).json();
          const fires = data.data || [];
          let addedFromFogosPt = 0;
          fires.forEach((fire: any) => {
            const fireId = String(fire.sadoId || fire.id);
            if (seenFireIds.has(fireId)) return; // já veio da fogosagora.pt
            seenFireIds.add(fireId);
            addedFromFogosPt++;
            alerts.push({
              id: `fire-${fireId}`,
              title: `Incêndio: ${fire.location || fire.localidade || 'Localização desconhecida'}`,
              description: `Status: ${fire.status}. Operacionais: ${fire.man ?? 0} | Veículos: ${fire.terrain ?? 0} | Aéreos: ${fire.aerial ?? 0}`,
              severity: (fire.man ?? 0) > 100 || (fire.aerial ?? 0) > 5 ? 'high' : (fire.man ?? 0) > 20 ? 'medium' : 'low',
              type: 'fire',
              location: { lat: fire.lat, lng: fire.lng },
              // api.fogos.pt inclui o próprio campo "active" — usamos diretamente.
              isActive: fire.active !== false,
              // Usa a última atualização em vez da data de criação, pelo mesmo motivo do bloco acima.
              timestamp: new Date(fire.updated?.sec ? fire.updated.sec * 1000 : (fire.dateTime?.sec ? fire.dateTime.sec * 1000 : Date.now()))
            });
          });
          if (addedFromFogosPt > 0) {
            console.log(`[Alerts] api.fogos.pt adicionou ${addedFromFogosPt} incêndios que a fogosagora.pt não tinha.`);
          }
        }
      } catch (e) {
        console.error("[Alerts] Falha ao processar api.fogos.pt — verifica se o FOGOS_API_TOKEN é válido (fonte ignorada nesta atualização):", e);
      }

      // Process FIRMS (NASA) — combinação de 4 satélites para máxima cobertura de deteção
      try {
        if (firmsRes.status === 'fulfilled') {
        const satelliteLabels = ['VIIRS Suomi-NPP', 'VIIRS NOAA-20', 'VIIRS NOAA-21', 'MODIS'];
        const csvTexts = firmsRes.value as string[];

        // Localizações já conhecidas (das outras fontes) + as que formos adicionando dos satélites,
        // para não duplicarmos nem entre fontes oficiais nem entre satélites diferentes.
        const knownFireLocations = alerts
          .filter(a => a.type === 'fire')
          .map(a => a.location);

        let addedFromFirms = 0;

        csvTexts.forEach((csvText, satIdx) => {
          if (!csvText || csvText.toLowerCase().includes('invalid')) return;
          const lines = csvText.trim().split('\n');
          if (lines.length <= 1) return;

          const headers = lines[0].split(',').map(h => h.trim());
          const latIdx = headers.indexOf('latitude');
          const lngIdx = headers.indexOf('longitude');
          const confIdx = headers.indexOf('confidence');
          const frpIdx = headers.indexOf('frp');
          const dateIdx = headers.indexOf('acq_date');
          const timeIdx = headers.indexOf('acq_time');

          lines.slice(1).forEach(line => {
            const cols = line.split(',');
            const lat = parseFloat(cols[latIdx]);
            const lng = parseFloat(cols[lngIdx]);
            if (isNaN(lat) || isNaN(lng)) return;

            // Se já há um foco conhecido a <3km (de outra fonte OU de outro satélite já processado), é o mesmo — ignora.
            const isDuplicate = knownFireLocations.some(loc => {
              const dLat = (loc.lat - lat) * 111;
              const dLng = (loc.lng - lng) * 111 * Math.cos(lat * Math.PI / 180);
              return Math.sqrt(dLat * dLat + dLng * dLng) < 3;
            });
            if (isDuplicate) return;

            const confidenceRaw = confIdx >= 0 ? cols[confIdx]?.trim() : '';
            const frp = frpIdx >= 0 ? parseFloat(cols[frpIdx]) : 0;
            const isLowConfidence = confidenceRaw === 'l' || confidenceRaw === '0';
            // Mantemos mesmo as deteções de baixa confiança agora — o objetivo é não perder nenhum foco possível.

            const confidenceLabel = confidenceRaw === 'h' || Number(confidenceRaw) > 80 ? 'Alta' :
                                     isLowConfidence ? 'Baixa' : 'Nominal';

            addedFromFirms++;
            const location = { lat, lng };
            knownFireLocations.push(location);
            // Nota: estes focos deixaram de ser adicionados à lista de alertas visível
            // (pedido do utilizador) — mantém-se apenas a deteção/registo em log.
          });
        });

        if (addedFromFirms > 0) {
          console.log(`[Alerts] NASA FIRMS (4 satélites combinados) detetou ${addedFromFirms} focos não reportados pelas outras fontes (não mostrados na lista de alertas).`);
        }
      }
      } catch (e) {
        console.error("[Alerts] Falha ao processar dados de satélite NASA FIRMS (fonte ignorada nesta atualização):", e);
      }

      alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      // If we got some alerts, update the cache
      if (alerts.length > 0) {
        cachedAlerts = alerts;
        lastFetchTime = Date.now();
        notifyNearbyUsersOfCriticalAlerts(alerts);
      } else if (cachedAlerts.length === 0) {
        // Absolute last resort: If cache is empty and all fetches failed, provide "System Status" alerts
        cachedAlerts = [{
          id: 'system-status',
          title: 'Sistemas SOS+: Operacionais',
          description: 'A rede SOS+ está activa e a monitorizar sismos, fogos e avisos meteorológicos em tempo real.',
          severity: 'low',
          type: 'info',
          location: { lat: 39.5, lng: -8.0 },
          timestamp: new Date()
        }];
      }
      
      console.log(`Alerts updated: ${alerts.length} events found at ${new Date().toISOString()}`);
    } catch (error) {
      console.error("Error fetching alerts:", error);
    }
  }

  /**
   * Applies retention and degradation logic to alerts
   * High: 5 days, Medium: 3 days, Low: 1.5 days
   * Critical alerts degrade over time: High -> Medium (after 24h) -> Low (after 48h)
   */
  function filterAndDegradeAlerts(alerts: any[]) {
    const now = Date.now();
    const MS_IN_HOUR = 3600 * 1000;
    
    return alerts.map(alert => {
      // Um incêndio verdadeiramente em curso nunca perde severidade por ser "antigo" —
      // continua perigoso enquanto a ANEPC o reportar como ativo.
      if (alert.isActive) return alert;

      const ageHours = (now - new Date(alert.timestamp).getTime()) / MS_IN_HOUR;
      let severity = alert.severity;

      // Degradation logic
      if (severity === 'high' && ageHours > 48) {
        severity = 'medium';
      }
      if (severity === 'medium' && ageHours > 96) {
        severity = 'low';
      }

      return { ...alert, severity };
    }).filter(alert => {
      // O mesmo se aplica à retenção — nunca desaparece enquanto estiver ativo.
      if (alert.isActive) return true;

      const ageHours = (now - new Date(alert.timestamp).getTime()) / MS_IN_HOUR;
      
      // Retention limits (in hours)
      const limits = {
        high: 168, // 7 dias
        medium: 120, // 5 dias
        low: 48    // 2 dias
      };

      return ageHours <= (limits[alert.severity as keyof typeof limits] || 24);
    });
  }

  // Initial fetch and scheduled background updates
  fetchAllAlerts();
  setInterval(fetchAllAlerts, CACHE_TTL);

  // API Routes
  app.get("/api/alerts", async (req, res) => {
    const forceRefresh = req.query.force === 'true';

    if (forceRefresh) {
      // Sincronização manual: espera mesmo por dados novos antes de responder.
      await fetchAllAlerts();
      const processedAlerts = filterAndDegradeAlerts(cachedAlerts);
      return res.json(processedAlerts);
    }

    // Apply filtering and degradation to the cached alerts before returning
    const processedAlerts = filterAndDegradeAlerts(cachedAlerts);
    res.json(processedAlerts);
    
    // If cache is old, trigger a background update
    if (Date.now() - lastFetchTime > CACHE_TTL) {
       fetchAllAlerts();
    }
  });

  /**
   * Localized greeting endpoint
   */
  app.get("/api/greeting", async (req, res) => {
    // Cumprimento sempre em português, com base na hora do dia (sem depender de serviços externos)
    const hour = new Date().getHours();
    let hello = "Olá";
    if (hour >= 5 && hour < 12) hello = "Bom dia";
    else if (hour >= 12 && hour < 20) hello = "Boa tarde";
    else hello = "Boa noite";
    res.json({ code: "pt", hello });
  });

  /**
   * Simple IP-based location detection fallback
   */
  app.get("/api/location/detect", async (req, res) => {
    try {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '8.8.8.8';
      const abstractKey = process.env.ABSTRACT_API_KEY;
      const bdcKey = process.env.BIGDATACLOUD_API_KEY;
      const ip2locKey = process.env.IP2LOCATION_API_KEY;
      const theIpApiKey = process.env.THEIPAPI_API_KEY;

      // 0. Try theipapi.com if key is provided
      if (theIpApiKey) {
        try {
          const response = await fetch(`https://api.theipapi.com/v1/ip/${ip}?api_key=${theIpApiKey}`, {
            signal: AbortSignal.timeout(3000)
          });
          if (response.ok) {
            const data = await response.json();
            if (data.country_code) {
              return res.json({
                country: data.country_name,
                city: data.city_name,
                countryCode: data.country_code,
                lat: data.latitude,
                lng: data.longitude,
                source: "theipapi"
              });
            }
          }
        } catch (e) {
          console.warn("[Location] theipapi failed");
        }
      }

      // 0. Try IP2Location if key is provided
      if (ip2locKey) {
        try {
          const response = await fetch(`https://api.ip2location.io/?key=${ip2locKey}&ip=${ip}`, {
            signal: AbortSignal.timeout(3000)
          });
          if (response.ok) {
            const data = await response.json();
            if (data.country_code) {
              return res.json({
                country: data.country_name,
                city: data.city_name,
                countryCode: data.country_code,
                lat: data.latitude,
                lng: data.longitude,
                source: "ip2location"
              });
            }
          }
        } catch (e) {
          console.warn("[Location] ip2location failed");
        }
      }

      // 0.1. Try ip-api.com (Very reliable keyless fallback)
      try {
        const ipApiResponse = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,city,lat,lon`, {
          signal: AbortSignal.timeout(3000)
        });
        if (ipApiResponse.ok) {
          const data = await ipApiResponse.json();
          if (data.status === 'success') {
            return res.json({
              country: data.country,
              city: data.city,
              countryCode: data.countryCode,
              lat: data.lat,
              lng: data.lon,
              source: "ip-api"
            });
          }
        }
      } catch (e) {
        console.warn("[Location] ip-api failed");
      }

      // 0.1. Try api.country.is (Fast & Keyless)
      try {
        const countryIsResponse = await fetch(`https://api.country.is/${ip}`, {
          signal: AbortSignal.timeout(2000)
        });
        if (countryIsResponse.ok) {
          const data = await countryIsResponse.json();
          if (data.country) {
            return res.json({
              country: data.country === 'PT' ? 'Portugal' : data.country,
              source: "country.is",
              countryCode: data.country
            });
          }
        }
      } catch (e) {
        console.warn("[Location] api.country.is failed");
      }

      // 0.5. Try geoplugin (Reliable fallback)
      try {
        const geoPluginResponse = await fetch(`http://www.geoplugin.net/json.gp?ip=${ip}`, {
          signal: AbortSignal.timeout(3000)
        });
        if (geoPluginResponse.ok) {
          const data = await geoPluginResponse.json();
          if (data.geoplugin_countryCode) {
            return res.json({
              country: data.geoplugin_countryName || "Portugal",
              city: data.geoplugin_city || "",
              source: "geoplugin",
              countryCode: data.geoplugin_countryCode
            });
          }
        }
      } catch (e) {
        console.warn("[Location] geoplugin failed");
      }

      // 1. Try BigDataCloud if key is provided (Reliable & Fast)
      if (bdcKey && bdcKey !== "MY_BDC_API_KEY") {
        try {
          console.log("[Location] Trying BigDataCloud IP Geolocation...");
          const bdcResponse = await fetch(`https://api.bigdatacloud.net/data/ip-lookup?ip=${ip}&key=${bdcKey}`, {
            signal: AbortSignal.timeout(3000)
          });
          if (bdcResponse.ok) {
            const data = await bdcResponse.json();
            return res.json({
              country: data.country?.name || "Portugal",
              city: data.location?.city || "Lisboa",
              source: "bigdatacloud",
              countryCode: data.country?.isoCode || "PT"
            });
          }
        } catch (e) {
          console.warn("[Location] BigDataCloud IP lookup failed");
        }
      }

      // 2. Try AbstractAPI if key is provided
      if (abstractKey && abstractKey !== "MY_ABSTRACT_API_KEY") {
        try {
          console.log("[Location] Trying AbstractAPI...");
          const absResponse = await fetch(`https://ip-intelligence.abstractapi.com/v1/?api_key=${abstractKey}&ip_address=${ip}`, {
            signal: AbortSignal.timeout(4000)
          });
          
          if (absResponse.ok) {
            const data = await absResponse.json();
            return res.json({
              country: data.location?.country || "Portugal",
              city: data.location?.city || "Lisboa",
              source: "abstract",
              countryCode: data.location?.country_code || "PT"
            });
          }
        } catch (e) {
          console.warn("[Location] AbstractAPI failed, falling back...");
        }
      }
      
      // 3. Fallback to ipapi.co
      const response = await fetch(`https://ipapi.co/${ip}/json/`, { 
        signal: AbortSignal.timeout(3000) 
      });
      
      if (response.ok) {
        const data = await response.json();
        return res.json({ 
          country: data.country_name || "Portugal",
          city: data.city || "Lisboa",
          source: "ipapi",
          countryCode: data.country_code || "PT"
        });
      }
      
      res.json({ country: "Portugal", source: "default", countryCode: "PT" });
    } catch (e) {
      res.json({ country: "Portugal", source: "error-fallback", countryCode: "PT" });
    }
  });

  /**
   * Google Maps Area Insights Proxy
   */
  app.post("/api/maps/insights", async (req, res) => {
    try {
      const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY;
      if (!apiKey) return res.status(500).json({ error: "Google Maps API Key not configured" });

      const response = await fetch("https://areainsights.googleapis.com/v1:computeInsights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey
        },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        const error = await response.text();
        return res.status(response.status).send(error);
      }

      const data = await response.json();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  /**
   * Google Maps Places Text Search Proxy (Optional fallback)
   */
  app.post("/api/maps/places/search", async (req, res) => {
    try {
      const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY;
      if (!apiKey) return res.status(500).json({ error: "Google Maps API Key not configured" });

      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": (req.headers["x-goog-fieldmask"] as string) || "places.id,places.displayName,places.location"
        },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        const error = await response.text();
        return res.status(response.status).send(error);
      }

      const data = await response.json();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Groq AI Chat Proxy (substitui o Gemini: gratuito, limites muito mais generosos)
  app.post("/api/chat", async (req, res) => {
    try {
      const groqKey = process.env.GROQ_API_KEY;
      if (!groqKey) {
        return res.status(503).json({ error: "IA Central temporariamente indisponível (Chave não configurada)." });
      }
      const { messages, systemInstruction } = req.body;

      // Converte o formato (estilo Gemini: role/parts) para o formato OpenAI-compatível usado pelo Groq
      const openaiMessages = [
        { role: "system", content: systemInstruction || "" },
        ...(messages || []).map((m: any) => ({
          role: m.role === 'model' ? 'assistant' : 'user',
          content: m.parts?.[0]?.text || ''
        }))
      ];

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: openaiMessages,
          temperature: 0.7,
          max_tokens: 350
        }),
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 429) {
          console.warn("[Chat] Groq Rate Limit reached.");
          return res.status(429).json({ error: "Limite de solicitações atingido. Tente novamente em breve." });
        }
        console.error("Groq Proxy Error:", errText);
        return res.status(500).json({ error: "Falha na comunicação com a IA Central. Por favor, tente novamente." });
      }

      const data = await response.json();
      const responseText = data.choices?.[0]?.message?.content || "Estou aqui consigo. Mantenha a calma.";
      res.json({ text: responseText });
    } catch (error: any) {
      console.error("Groq Proxy Error:", error);
      res.status(500).json({ error: "Falha na comunicação com a IA Central. Por favor, tente novamente." });
    }
  });

  // Catch-all for API routes to prevent HTML fallbacks on failed API calls
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
