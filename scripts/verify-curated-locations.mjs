#!/usr/bin/env node
/**
 * Verificador de sanidade para as coordenadas curadas de reserva em
 * src/services/emergencyService.ts (hospitais, PSP, bombeiros, câmaras,
 * centros de saúde).
 *
 * O QUE ISTO FAZ (e não faz):
 * Isto NÃO confirma que uma coordenada está certa — não há geocoding fiável
 * e gratuito disponível para verificação automática em massa (o Nominatim
 * bloqueia acesso automatizado). O que isto faz é apanhar os erros GROSSEIROS
 * que um olhar rápido não apanha em centenas de linhas:
 *
 *   1. Coordenadas fora de Portugal (continente/Madeira/Açores) — normalmente
 *      sinal de latitude/longitude trocadas, ou copiadas de outro sítio.
 *   2. PSP/bombeiros distrital a mais de 5km do centro da própria capital de
 *      distrito onde deveriam estar (estas sedes ficam sempre dentro da
 *      cidade-sede, nunca a léguas de distância).
 *   3. Coordenadas EXATAMENTE duplicadas entre duas entradas com nomes
 *      diferentes — sinal de erro de copy-paste em massa (foi assim que a
 *      PSP de Viseu apareceu junto à Porta do Soar em vez do edifício certo:
 *      a fonte original tinha essa coordenada errada copiada para várias
 *      moradas da mesma rua).
 *
 * Isto é um primeiro filtro, não uma garantia. Uma entrada que passa aqui
 * ainda pode estar errada por algumas centenas de metros (como aconteceu).
 * Trata os resultados como uma lista de prioridades para verificar à mão,
 * não como "está tudo bem".
 *
 * USO:
 *   node scripts/verify-curated-locations.mjs
 *
 * Não precisa de npm install nem de nenhuma chave de API — só lê o ficheiro
 * fonte como texto.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_FILE = join(__dirname, '..', 'src', 'services', 'emergencyService.ts');

const source = readFileSync(SOURCE_FILE, 'utf-8');

// --- Extração dos dados curados diretamente do código-fonte -----------------
// Propositadamente simples (regex, não um parser de TypeScript completo) —
// isto é um script de verificação, não faz parte do build da app, por isso
// não vale a pena a complexidade de um parser AST só para isto.

function extractBlock(varName, kind) {
  const startMarker = `const ${varName}`;
  const startIdx = source.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error(`Não encontrei "${varName}" em ${SOURCE_FILE} — o nome da variável mudou?`);
  }
  // Procura o "=" da atribuição primeiro — a anotação de tipo antes dele pode
  // conter o seu próprio "[]" ou "{}" (ex: "{ ... }[]", ou "Record<string, {...}>"),
  // que não é o array/objeto que queremos. Só depois do "=" é que começa o valor real.
  const assignIdx = source.indexOf('=', startIdx);
  const braceOpen = source.indexOf(kind === 'record' ? '{' : '[', assignIdx);
  const openChar = source[braceOpen];
  const closeChar = openChar === '[' ? ']' : '}';
  let depth = 0;
  let i = braceOpen;
  for (; i < source.length; i++) {
    if (source[i] === openChar) depth++;
    else if (source[i] === closeChar) {
      depth--;
      if (depth === 0) break;
    }
  }
  return source.slice(braceOpen, i + 1);
}

function parseEntries(block) {
  // Cada entrada tem sempre lat: <num>, lng: <num> — extraímos por regex em
  // vez de fazer eval() (nunca corras eval em texto lido de um ficheiro).
  const entryRegex = /\{\s*(?:concelho:\s*"([^"]+)",\s*)?name:\s*"([^"]+)",\s*lat:\s*(-?\d+\.?\d*),\s*lng:\s*(-?\d+\.?\d*)\s*\}/g;
  const entries = [];
  let m;
  while ((m = entryRegex.exec(block)) !== null) {
    entries.push({
      concelho: m[1] || null,
      name: m[2],
      lat: parseFloat(m[3]),
      lng: parseFloat(m[4])
    });
  }
  return entries;
}

function parseRecordEntries(block) {
  // Para Record<string, {...}> tipo REAL_POLICE_BY_CAPITAL: "Viseu": { name: ..., lat: ..., lng: ... }
  const entryRegex = /"([^"]+)":\s*\{\s*name:\s*"([^"]+)",\s*lat:\s*(-?\d+\.?\d*),\s*lng:\s*(-?\d+\.?\d*)\s*\}/g;
  const entries = [];
  let m;
  while ((m = entryRegex.exec(block)) !== null) {
    entries.push({ key: m[1], name: m[2], lat: parseFloat(m[3]), lng: parseFloat(m[4]) });
  }
  return entries;
}

const districtCapitals = parseEntries(extractBlock('DISTRICT_CAPITALS', 'array'));
const hospitals = parseEntries(extractBlock('REAL_PORTUGAL_HOSPITALS', 'array'));
const police = parseRecordEntries(extractBlock('REAL_POLICE_BY_CAPITAL', 'record'));
const fire = parseRecordEntries(extractBlock('REAL_FIRE_BY_CAPITAL', 'record'));
const municipalities = parseEntries(extractBlock('REAL_MUNICIPALITIES', 'array'));
const healthCenters = parseEntries(extractBlock('REAL_HEALTH_CENTERS_LVT', 'array'));

console.log(`Lidas ${districtCapitals.length} capitais de distrito, ${hospitals.length} hospitais, ${police.length} PSP, ${fire.length} bombeiros, ${municipalities.length} câmaras, ${healthCenters.length} centros de saúde.\n`);

// --- Utilitários --------------------------------------------------------

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Caixas delimitadoras aproximadas — só para apanhar erros grosseiros
// (lat/lng trocadas, sinal errado, coordenada de outro país).
const BOUNDING_BOXES = [
  { name: 'Continente', latMin: 36.8, latMax: 42.2, lngMin: -9.6, lngMax: -6.0 },
  { name: 'Madeira', latMin: 32.3, latMax: 33.2, lngMin: -17.3, lngMax: -16.2 },
  { name: 'Açores', latMin: 36.9, latMax: 39.8, lngMin: -31.5, lngMax: -24.7 }
];

function insideAnyBoundingBox(lat, lng) {
  return BOUNDING_BOXES.some(b => lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax);
}

// --- Verificações --------------------------------------------------------

const issues = [];

function checkBoundingBox(list, label) {
  for (const entry of list) {
    if (!insideAnyBoundingBox(entry.lat, entry.lng)) {
      issues.push({
        severity: 'GRAVE',
        list: label,
        name: entry.name,
        detail: `Coordenada (${entry.lat}, ${entry.lng}) fora de Portugal (continente/Madeira/Açores) — provável erro de digitação ou lat/lng trocadas.`
      });
    }
  }
}

checkBoundingBox(hospitals, 'Hospitais');
checkBoundingBox(police.map(p => ({ name: `${p.key}: ${p.name}`, lat: p.lat, lng: p.lng })), 'PSP');
checkBoundingBox(fire.map(f => ({ name: `${f.key}: ${f.name}`, lat: f.lat, lng: f.lng })), 'Bombeiros');
checkBoundingBox(municipalities, 'Câmaras');
checkBoundingBox(healthCenters, 'Centros de Saúde');

// PSP e bombeiros distritais têm de estar perto (< 5km) do centro da própria
// capital de distrito — são sedes distritais, ficam sempre dentro da cidade-sede.
const CAPITAL_RADIUS_KM = 5;

function checkAgainstCapital(records, label) {
  for (const entry of records) {
    const capital = districtCapitals.find(c => c.name === entry.key || c.name.startsWith(entry.key));
    if (!capital) {
      issues.push({
        severity: 'AVISO',
        list: label,
        name: `${entry.key}: ${entry.name}`,
        detail: `Não encontrei "${entry.key}" em DISTRICT_CAPITALS para comparar — verificar manualmente.`
      });
      continue;
    }
    const dist = haversineKm(entry.lat, entry.lng, capital.lat, capital.lng);
    if (dist > CAPITAL_RADIUS_KM) {
      issues.push({
        severity: 'REVER',
        list: label,
        name: `${entry.key}: ${entry.name}`,
        detail: `A ${dist.toFixed(1)}km do centro registado de ${capital.name} (limite: ${CAPITAL_RADIUS_KM}km) — pode estar no sítio errado.`
      });
    }
  }
}

checkAgainstCapital(police, 'PSP');
checkAgainstCapital(fire, 'Bombeiros');

// Coordenadas EXATAMENTE duplicadas entre entradas com nomes diferentes —
// sinal de erro de copy-paste em massa na fonte original dos dados.
function checkDuplicateCoordinates() {
  const all = [
    ...hospitals.map(e => ({ ...e, list: 'Hospitais' })),
    ...police.map(e => ({ name: e.name, lat: e.lat, lng: e.lng, list: 'PSP' })),
    ...fire.map(e => ({ name: e.name, lat: e.lat, lng: e.lng, list: 'Bombeiros' })),
    ...municipalities.map(e => ({ ...e, list: 'Câmaras' })),
    ...healthCenters.map(e => ({ ...e, list: 'Centros de Saúde' }))
  ];
  const byCoord = new Map();
  for (const entry of all) {
    const key = `${entry.lat.toFixed(5)},${entry.lng.toFixed(5)}`;
    if (!byCoord.has(key)) byCoord.set(key, []);
    byCoord.get(key).push(entry);
  }
  for (const [coord, entries] of byCoord) {
    const uniqueNames = new Set(entries.map(e => e.name));
    if (uniqueNames.size > 1) {
      issues.push({
        severity: 'GRAVE',
        list: 'Duplicados',
        name: [...uniqueNames].join(' / '),
        detail: `${entries.length} entradas diferentes partilham exatamente a mesma coordenada (${coord}) — quase de certeza um erro de copy-paste na fonte original.`
      });
    }
  }
}

checkDuplicateCoordinates();

// --- Relatório ------------------------------------------------------------

const order = { GRAVE: 0, REVER: 1, AVISO: 2 };
issues.sort((a, b) => order[a.severity] - order[b.severity]);

if (issues.length === 0) {
  console.log('✅ Nenhum problema encontrado pelas verificações automáticas.');
  console.log('   (Lembrete: isto só apanha erros grosseiros — não é uma garantia de precisão.)');
} else {
  console.log(`⚠️  ${issues.length} entrada(s) para rever, por ordem de prioridade:\n`);
  for (const issue of issues) {
    console.log(`[${issue.severity}] ${issue.list} — ${issue.name}`);
    console.log(`  ${issue.detail}\n`);
  }
}

const graveCount = issues.filter(i => i.severity === 'GRAVE').length;
const reverCount = issues.filter(i => i.severity === 'REVER').length;
console.log(`Resumo: ${graveCount} grave(s), ${reverCount} para rever, ${issues.length - graveCount - reverCount} aviso(s).`);
