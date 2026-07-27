import React, { useState } from 'react';
import { ShieldPlus, Scale, Eye, Cpu, ChevronLeft, Bell, Lock, BookOpen, ChevronRight, FileText, Globe, Loader2, ShieldCheck, AlertCircle, MapPin, Cookie, Copyright, RefreshCw, HelpCircle } from 'lucide-react';
import { sendAlertNotification, requestNotificationPermission } from '../../lib/notifications';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { logger } from '../../lib/logger';

interface LegalTermsProps {
  onBack: () => void;
}

type Section = 'main' | 'privacy' | 'ai' | 'terms' | 'authority' | 'cookies' | 'copyright' | 'return' | 'faq';

export function LegalTerms({ onBack }: LegalTermsProps) {
  const [activeSection, setActiveSection] = useState<Section>('main');
  const [isTestingSignal, setIsTestingSignal] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'denied' | null>(null);

  const handleTestNotification = async () => {
    setIsTestingSignal(true);
    setTestResult(null);
    
    try {
      // Re-verify if permission is already granted
      if (Notification.permission === 'granted') {
        sendAlertNotification(
          "SOS MAIS: Teste de Vigilância",
          "Conexão segura estabelecida. Receberá alertas críticos em tempo real.",
          "high"
        );
        setTestResult('success');
      } else {
        const granted = await requestNotificationPermission();
        if (granted) {
          sendAlertNotification(
            "SOS MAIS: Teste de Vigilância",
            "As notificações de emergência críticas estão ativas e sincronizadas.",
            "high"
          );
          setTestResult('success');
        } else {
          setTestResult('denied');
        }
      }
    } catch (error) {
      logger.error('Notification test error:', error);
      setTestResult('denied');
    } finally {
      setIsTestingSignal(false);
      // Auto clear result after 5 seconds
      setTimeout(() => setTestResult(null), 5000);
    }
  };

  const menuItems = [
    { id: 'faq', icon: HelpCircle, title: 'Perguntas Frequentes (FAQ)', subtitle: 'Dúvidas e respostas comuns' },
    { id: 'terms', icon: FileText, title: 'Termos de Utilização', subtitle: 'Regras de uso da plataforma' },
    { id: 'privacy', icon: Eye, title: 'Política de Privacidade', subtitle: 'Proteção de dados e RGPD' },
    { id: 'authority', icon: Scale, title: 'Fontes e Autoridade', subtitle: 'Instituições e aviso legal' },
    { id: 'ai', icon: Cpu, title: 'IA e Algoritmos', subtitle: 'Conformidade EU AI Act' },
    { id: 'cookies', icon: Cookie, title: 'Política de Cookies', subtitle: 'Gestão de rastreio e cache' },
    { id: 'copyright', icon: Copyright, title: 'Direitos de Autor', subtitle: 'Propriedade intelectual e marcas' },
    { id: 'return', icon: RefreshCw, title: 'Política de Reembolso', subtitle: 'Serviços digitais e cancelamento' },
  ];

  if (activeSection !== 'main') {
    return (
      <div className="flex flex-col h-[100dvh] bg-white overflow-hidden max-w-md mx-auto shadow-2xl relative z-50">
        <header className="bg-white/80 backdrop-blur-md border-b px-5 py-6 flex items-center gap-4 sticky top-0 z-20 shrink-0">
          <button 
            onClick={() => setActiveSection('main')}
            className="p-2.5 hover:bg-slate-50 rounded-full transition-colors"
          >
            <ChevronLeft className="w-6 h-6 text-slate-900" />
          </button>
          <div>
            <h2 className="font-black text-sm uppercase tracking-tighter text-slate-900 leading-none">
              {menuItems.find(m => m.id === activeSection)?.title}
            </h2>
            <p className="text-[9px] font-black text-red-600 uppercase tracking-widest mt-1">SOS MAIS Legal</p>
          </div>
        </header>
        
        <div className="flex-1 overflow-y-auto px-6 pt-4 pb-0 space-y-6 scroll-smooth overscroll-contain relative bg-white">
          {activeSection === 'privacy' && (
            <div className="space-y-4 pb-2 relative z-0">
               <div className="bg-red-50/50 p-5 rounded-[28px] border border-red-100 flex gap-4">
                 <ShieldPlus className="w-5 h-5 text-red-600 shrink-0 mt-1" />
                 <p className="text-[11px] text-red-900 font-bold uppercase leading-relaxed tracking-tight">
                   Compromisso SOS MAIS: A sua segurança nunca deve comprometer a sua anonimidade. Estamos em conformidade total com a Lei n.º 58/2019 e o RGPD da UE.
                 </p>
               </div>
               
               <div className="space-y-2">
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">Princípios Fundamentais</h4>
                 <p className="text-[12px] text-slate-600 leading-relaxed font-medium bg-slate-50 p-5 rounded-[24px] border border-slate-100">
                   O SOS MAIS cumpre rigorosamente o RGPD. Implementamos o princípio de "Privacidade por Design". Os seus dados de Google ou rede são processados apenas para autenticação segura e nunca são vendidos ou perfilados.
                 </p>
               </div>

               <div className="space-y-4">
                 <div className="p-5 bg-white rounded-[32px] border border-slate-100 shadow-sm flex gap-4">
                    <Lock className="w-6 h-6 text-slate-900 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-[11px] text-slate-900 font-black uppercase">Recolha de Dados Mínima</p>
                      <p className="text-[10px] text-slate-500 leading-relaxed font-medium italic">Apenas recolhemos o seu número de telefone e nome para fins de identificação durante resgates. Estes dados são encriptados e nunca partilhados com terceiros para fins comerciais.</p>
                    </div>
                 </div>
                 <div className="p-5 bg-white rounded-[32px] border border-slate-100 shadow-sm flex gap-4">
                    <MapPin className="w-6 h-6 text-slate-900 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-[11px] text-slate-900 font-black uppercase">Geolocalização Controlada</p>
                      <p className="text-[10px] text-slate-500 leading-relaxed font-medium italic">A localização é processada estritamente no dispositivo. Em caso de SOS, as coordenadas são enviadas apenas aos seus contactos de emergência pessoais, guardados por si na app — <span className="font-bold not-italic">não são enviadas diretamente às autoridades (112/ANEPC)</span>. Para emergências que exigem resposta oficial, ligue sempre 112.</p>
                    </div>
                 </div>
                 <div className="p-5 bg-white rounded-[32px] border border-slate-100 shadow-sm flex gap-4">
                    <Eye className="w-6 h-6 text-slate-900 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-[11px] text-slate-900 font-black uppercase">Direito ao Esquecimento</p>
                      <p className="text-[10px] text-slate-500 leading-relaxed font-medium italic">O utilizador tem total controlo sobre os seus dados. Pode eliminar o seu perfil e todos os dados associados diretamente nas definições da aplicação em qualquer momento.</p>
                    </div>
                 </div>
                 <div className="p-5 bg-white rounded-[32px] border border-slate-100 shadow-sm flex gap-4">
                    <ShieldCheck className="w-6 h-6 text-slate-900 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-[11px] text-slate-900 font-black uppercase">Segurança de Infraestrutura</p>
                      <p className="text-[10px] text-slate-500 leading-relaxed font-medium italic">Utilizamos protocolos de segurança TLS 1.3 e encriptação AES-256 para garantir que nenhum dado possa ser interceptado em trânsito.</p>
                    </div>
                 </div>
                 <div className="p-5 bg-white rounded-[32px] border border-slate-100 shadow-sm flex gap-4">
                    <Bell className="w-6 h-6 text-slate-900 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-[11px] text-slate-900 font-black uppercase">Retenção de Alertas</p>
                      <p className="text-[10px] text-slate-500 leading-relaxed font-medium italic">O histórico de alertas recebidos é armazenado apenas localmente no terminal do utilizador e nunca nos nossos servidores centrais.</p>
                    </div>
                 </div>
                 <div className="p-5 bg-white rounded-[32px] border border-slate-100 shadow-sm flex gap-4">
                    <Scale className="w-6 h-6 text-slate-900 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-[11px] text-slate-900 font-black uppercase">Enquadramento Legal (Portugal)</p>
                      <p className="text-[10px] text-slate-500 leading-relaxed font-medium italic">Atuamos sob a jurisdição portuguesa, garantindo todos os direitos previstos na Lei n.º 58/2019 e assegurando transparência total.</p>
                    </div>
                 </div>
               </div>

               <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 space-y-3">
                 <p className="text-[10px] font-black text-red-600 uppercase tracking-widest leading-none">Dados Externos</p>
                 <p className="text-[10px] text-slate-500 font-bold leading-relaxed uppercase">
                   Ao ligar a sua conta Google, apenas acedemos ao seu e-mail e nome para autenticação de segurança. Não acedemos aos seus contactos, e-mails ou ficheiros privados.
                 </p>
               </div>

               <div className="space-y-2">
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">Titular do Tratamento de Dados</h4>
                 <div className="bg-amber-50 p-5 rounded-[24px] border border-amber-200 space-y-1">
                   <p className="text-[10px] text-amber-900 font-bold uppercase leading-relaxed">
                     [A PREENCHER] Nome/Firma, NIF, morada e contacto do responsável pelo tratamento de dados devem ser aqui identificados antes da publicação pública da app, conforme exigido pelo Art. 13.º do RGPD e pelo Decreto-Lei n.º 7/2004 (comércio eletrónico).
                   </p>
                   <p className="text-[9px] text-amber-700 leading-relaxed">Contacto para questões de privacidade: [email a definir]</p>
                 </div>
               </div>

               <div className="space-y-2">
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">Base Legal do Tratamento (Art. 6.º e 9.º RGPD)</h4>
                 <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-2">
                   <p className="text-[10px] text-slate-600 leading-relaxed"><span className="font-black text-slate-900">Conta e perfil:</span> consentimento do utilizador (Art. 6.º/1/a).</p>
                   <p className="text-[10px] text-slate-600 leading-relaxed"><span className="font-black text-slate-900">Localização em situação de SOS:</span> interesses vitais do titular ou de terceiro (Art. 6.º/1/d) — aplicável apenas quando o utilizador aciona o alerta de emergência.</p>
                   <p className="text-[10px] text-slate-600 leading-relaxed"><span className="font-black text-slate-900">Dados de saúde no perfil (alergias, tipo sanguíneo):</span> categoria especial de dados (Art. 9.º) — tratados apenas com consentimento explícito. São guardados no seu dispositivo e, caso tenha sessão iniciada, sincronizados de forma encriptada nos nossos servidores (Firestore/Google Cloud) para que o seu perfil de saúde esteja disponível em caso de emergência, mesmo que troque de dispositivo.</p>
                 </div>
               </div>

               <div className="space-y-2">
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">Os Seus Direitos (Art. 15.º a 22.º RGPD)</h4>
                 <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-1.5">
                   <p className="text-[10px] text-slate-600 leading-relaxed">Tem direito de acesso, retificação, apagamento, limitação, portabilidade e oposição ao tratamento dos seus dados, exercíveis diretamente na app (Perfil) ou pelo contacto de privacidade acima.</p>
                   <p className="text-[10px] text-slate-600 leading-relaxed">Tem ainda o direito de apresentar reclamação à <span className="font-black text-slate-900">Comissão Nacional de Proteção de Dados (CNPD)</span> — geral@cnpd.pt, www.cnpd.pt — se considerar que o tratamento dos seus dados viola o RGPD.</p>
                 </div>
               </div>

               <div className="space-y-2">
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">Transferências Internacionais</h4>
                 <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm">
                   <p className="text-[10px] text-slate-600 leading-relaxed">Utilizamos infraestrutura Firebase/Google Cloud, que pode processar dados em servidores fora do Espaço Económico Europeu. Estas transferências estão cobertas pelas Cláusulas Contratuais-Tipo da Comissão Europeia, adotadas pelo fornecedor.</p>
                 </div>
               </div>

               <div className="space-y-2">
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">Utilização por Menores</h4>
                 <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm">
                   <p className="text-[10px] text-slate-600 leading-relaxed">Em Portugal, o consentimento digital autónomo é válido a partir dos 13 anos (Lei n.º 58/2019). Utilizadores entre os 13 e os 18 anos podem usar a app; para menores de 13 anos, é necessário o consentimento de quem exerça a responsabilidade parental.</p>
                 </div>
               </div>
            </div>
          )}

          {activeSection === 'copyright' && (
            <div className="space-y-4 pb-2 text-slate-900">
              <div className="bg-slate-900 p-6 rounded-[32px] text-white flex gap-4 shadow-xl">
                <Copyright className="w-6 h-6 text-red-500 shrink-0" />
                <p className="text-[11px] text-slate-300 font-bold uppercase leading-relaxed">
                  SOS MAIS HUB © 2026. Todos os direitos reservados.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-5 bg-white rounded-[32px] border border-slate-100 shadow-sm space-y-2">
                  <p className="text-[11px] text-slate-900 font-black uppercase">Propriedade Intelectual</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium">O nome SOS MAIS, o logotipo e a interface visual da aplicação são propriedade exclusiva do SOS MAIS HUB. Qualquer reprodução não autorizada é estritamente proibida.</p>
                </div>
                <div className="p-5 bg-white rounded-[32px] border border-slate-100 shadow-sm space-y-2">
                  <p className="text-[11px] text-slate-900 font-black uppercase">Conteúdo de Terceiros</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium">Os dados de radares e alertas são agregados de fontes oficiais (IPMA, ANEPC) sob as suas respectivas licenças de dados abertos.</p>
                </div>
                <div className="p-5 bg-white rounded-[32px] border border-slate-100 shadow-sm space-y-2">
                  <p className="text-[11px] text-slate-900 font-black uppercase">Software Open Source</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium font-mono bg-slate-50 p-3 rounded-xl border border-slate-200">
                    Construído com bibliotecas de código aberto sob licenças MIT e Apache 2.0.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'return' && (
            <div className="space-y-4 pb-2">
              <div className="bg-blue-50/50 p-6 rounded-[32px] border border-blue-100 flex gap-4">
                <RefreshCw className="w-6 h-6 text-blue-600 shrink-0" />
                <p className="text-[11px] text-blue-900 font-bold uppercase leading-relaxed">
                  O SOS MAIS é uma aplicação focada na segurança pública. A maioria das nossas funcionalidades é gratuita.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-5 bg-white rounded-[32px] border border-slate-100 shadow-sm space-y-2">
                  <p className="text-[11px] text-slate-900 font-black uppercase">Serviços Premium</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium">Para subscrições digitais premium, o utilizador tem o direito de livre resolução num prazo de 14 dias após a compra, conforme o Decreto-Lei n.º 24/2014.</p>
                </div>
                <div className="p-5 bg-white rounded-[32px] border border-slate-100 shadow-sm space-y-2">
                  <p className="text-[11px] text-slate-900 font-black uppercase">Exclusões</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium">Não há direito a reembolso para serviços que tenham sido totalmente executados com o consentimento do utilizador durante o período de reflexão.</p>
                </div>
                <div className="p-5 bg-amber-50 rounded-[32px] border border-amber-200 space-y-2">
                  <p className="text-[11px] text-amber-900 font-black uppercase">Resolução Alternativa de Litígios (RAL)</p>
                  <p className="text-[10px] text-amber-700 leading-relaxed">Nos termos da Lei n.º 144/2015, em caso de litígio de consumo não resolvido diretamente connosco, o utilizador pode recorrer a uma entidade de RAL. [A PREENCHER] indicar aqui o Centro de Arbitragem de Conflitos de Consumo da área de domicílio, ou consultar o Portal do Consumidor (www.consumidor.gov.pt) para identificar a entidade competente.</p>
                </div>
                <div className="p-5 bg-amber-50 rounded-[32px] border border-amber-200 space-y-2">
                  <p className="text-[11px] text-amber-900 font-black uppercase">Livro de Reclamações Eletrónico</p>
                  <p className="text-[10px] text-amber-700 leading-relaxed">Nos termos do Decreto-Lei n.º 74/2017, o SOS MAIS disponibiliza aos utilizadores o Livro de Reclamações Eletrónico, acessível em <span className="font-black">www.livroreclamacoes.pt</span>. [A PREENCHER] Este direito só é exigível a partir do momento em que a entidade responsável esteja formalmente registada como prestador de bens/serviços a consumidores.</p>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'faq' && (
            <div className="space-y-4 pb-2">
              {[
                { q: "O SOS MAIS substitui o 112?", a: "Não. Nunca. O SOS MAIS é um apoio visual e de dados. Em emergências extremas, ligue sempre imediatamente para o 112." },
                { q: "A aplicação funciona sem rede?", a: "Algumas funções de guias de emergência e histórico de alertas funcionam offline. O mapa e alertas em tempo real requerem conexão de dados." },
                { q: "A bateria do meu telemóvel gasta mais?", a: "O SOS MAIS está otimizado para usar GPS apenas quando necessário (Modo Vigilância Ativa). Em stand-by, o uso de bateria é negligenciável." },
                { q: "Os alertas são oficiais?", a: "Sim. Agregamos dados do IPMA e da Proteção Civil. No entanto, podem ocorrer atrasos de rede na recepção." },
                { q: "Como elimino os meus dados?", a: "Pode eliminar contactos individuais na secção Contactos, ou terminar sessão e eliminar a sua conta por completo em Perfil > Eliminar Conta. A eliminação de conta remove o seu perfil do Firestore e a conta de autenticação de forma permanente." }
              ].map((item, i) => (
                <div key={i} className="p-5 bg-white rounded-[32px] border border-slate-100 shadow-sm space-y-2">
                  <p className="text-[11px] text-slate-900 font-black uppercase">{item.q}</p>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium italic">{item.a}</p>
                </div>
              ))}
            </div>
          )}

          {activeSection === 'cookies' && (
            <div className="space-y-4 pb-2">
              <div className="bg-blue-50/50 p-6 rounded-[32px] border border-blue-100 flex gap-4">
                <Cookie className="w-6 h-6 text-blue-600 shrink-0" />
                <p className="text-[11px] text-blue-900 font-bold uppercase leading-relaxed">
                  Transparência SOS MAIS: Não utilizamos cookies de rastreio comercial ou publicidade personalizada. A nossa prioridade é a sua resiliência e não o lucro.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-5 bg-white rounded-[32px] border border-slate-100 shadow-sm flex gap-4">
                  <div className="w-10 h-10 bg-blue-50 rounded-2xl flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] text-slate-900 font-black uppercase">Cookies Essenciais</p>
                    <p className="text-[10px] text-slate-500 leading-relaxed font-medium italic">Utilizamos apenas cookies técnicos fundamentais para manter a sua sessão de segurança ativa e garantir que o sinal de alerta chegue ao destino.</p>
                  </div>
                </div>
                <div className="p-5 bg-white rounded-[32px] border border-slate-100 shadow-sm flex gap-4">
                  <div className="w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center shrink-0">
                    <Lock className="w-5 h-5 text-slate-900" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] text-slate-900 font-black uppercase">LocalStorage de Sobrevivência</p>
                    <p className="text-[10px] text-slate-500 leading-relaxed font-medium italic">Guardamos o seu perfil de saúde e preferências apenas localmente no browser (LocalStorage) para acesso rápido offline.</p>
                  </div>
                </div>
                <div className="p-5 bg-white rounded-[32px] border border-slate-100 shadow-sm flex gap-4">
                  <div className="w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center shrink-0">
                    <Globe className="w-5 h-5 text-slate-900" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] text-slate-900 font-black uppercase">Cache de Mapas</p>
                    <p className="text-[10px] text-slate-500 leading-relaxed font-medium italic">Podemos armazenar em cache fragmentos de mapas essenciais para garantir que tenha orientação visual mesmo sem cobertura de rede.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'ai' && (
            <div className="space-y-4 pb-2">
               <p className="text-xs text-slate-600 leading-relaxed font-medium">
                 O SOS MAIS utiliza um assistente de Inteligência Artificial conversacional para ajudar a orientar o utilizador durante situações de emergência, sugerindo guias práticos e respostas imediatas com base no que é descrito na conversa.
               </p>
               <div className="space-y-4">
                 <div className="p-5 bg-blue-50 rounded-[32px] border border-blue-100 flex gap-4">
                    <Cpu className="w-5 h-5 text-blue-600 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-[10px] text-blue-900 font-black uppercase">Assistente, Não Substituto</p>
                      <p className="text-[10px] text-blue-700/70 leading-relaxed">O assistente de IA é um apoio informativo e não substitui os serviços de emergência oficiais. Em risco de vida, ligue sempre 112.</p>
                    </div>
                 </div>
                 <div className="p-5 bg-slate-50 rounded-[32px] border border-slate-100 flex gap-4">
                    <Globe className="w-5 h-5 text-slate-900 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-[10px] text-slate-900 font-black uppercase">Requer Ligação à Internet</p>
                      <p className="text-[10px] text-slate-500 leading-relaxed">As respostas do assistente são processadas em servidores externos, pelo que o chat de IA só funciona com ligação de dados ativa. Os guias de emergência offline continuam disponíveis sem rede.</p>
                    </div>
                 </div>
                 <div className="p-5 bg-slate-50 rounded-[32px] border border-slate-100 flex gap-4">
                    <ShieldCheck className="w-5 h-5 text-slate-900 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-[10px] text-slate-900 font-black uppercase">Guia de Voz Local</p>
                      <p className="text-[10px] text-slate-500 leading-relaxed">A leitura em voz alta das respostas é feita através do sintetizador de voz do próprio dispositivo, sem envio de áudio para servidores externos.</p>
                    </div>
                 </div>
               </div>
            </div>
          )}

          {activeSection === 'terms' && (
            <div className="space-y-4 pb-2">
               <p className="text-xs text-slate-600 leading-relaxed font-medium">
                 Ao utilizar o SOS MAIS, o utilizador concorda que este é um sistema subsidiário de apoio à resiliência civil.
               </p>
               <div className="space-y-1">
                 {[
                   'Uso responsável e ético do sinal SOS',
                   'Veracidade dos dados do terminal móvel',
                   'Aceitação de notificações críticas',
                   'Entendimento de que não substitui o 112',
                   'Proibição de engenharia reversa do código SOS MAIS',
                   'Aceitação de localização contínua em modo Vigilância'
                 ].map((item, i) => (
                   <div key={i} className="flex items-center gap-3 p-4 border-b border-slate-50">
                     <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                     <span className="text-[10px] font-black text-slate-900 uppercase tracking-tight">{item}</span>
                   </div>
                 ))}
               </div>
               <div className="p-5 bg-slate-50 rounded-[24px] border border-slate-100 space-y-1">
                 <p className="text-[10px] font-black text-slate-900 uppercase">Lei Aplicável e Foro</p>
                 <p className="text-[10px] text-slate-500 leading-relaxed">Estes Termos regem-se pela lei portuguesa. Para a resolução de qualquer litígio, é competente o tribunal da comarca do domicílio do utilizador, sem prejuízo do recurso a entidades de resolução alternativa de litígios de consumo.</p>
               </div>
            </div>
          )}

          {activeSection === 'authority' && (
            <div className="space-y-4 pb-2">
               <div className="p-6 bg-red-50 rounded-[32px] border border-red-100">
                  <p className="text-xs text-red-900 font-medium leading-relaxed">
                    O SOS MAIS agrega e apresenta informação pública disponibilizada pelo IPMA e pela ANEPC (Autoridade Nacional de Emergência e Proteção Civil) através dos respetivos canais de dados abertos. O SOS MAIS não é uma entidade oficial nem está integrado nos sistemas operacionais dessas autoridades.
                  </p>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div className="p-4 bg-slate-50 rounded-2xl text-center">
                    <p className="text-[10px] font-black text-slate-900 uppercase">IPMA</p>
                    <p className="text-[8px] text-slate-400 uppercase font-bold">Monitorização Sísmica</p>
                 </div>
                 <div className="p-4 bg-slate-50 rounded-2xl text-center">
                    <p className="text-[10px] font-black text-slate-900 uppercase">ANEPC</p>
                    <p className="text-[8px] text-slate-400 uppercase font-bold">Monitorização Civil</p>
                 </div>
               </div>
            </div>
          )}
        </div>

        <footer className="p-5 border-t border-slate-50 bg-slate-50/50 shrink-0">
          <button 
            onClick={() => setActiveSection('main')}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-slate-900/10 active:scale-95 transition-all"
          >
            Voltar ao Menu Legal
          </button>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 overflow-hidden max-w-md mx-auto shadow-2xl relative z-50">
      <header className="bg-white/80 backdrop-blur-md border-b px-5 py-6 flex items-center gap-4 sticky top-0 z-20 shrink-0">
        <button 
          onClick={onBack}
          className="p-2.5 hover:bg-slate-50 rounded-full transition-colors"
        >
          <ChevronLeft className="w-6 h-6 text-slate-900" />
        </button>
        <div>
          <h2 className="font-black text-sm uppercase tracking-tighter text-slate-900 leading-none">Legal & Conformidade</h2>
          <p className="text-[9px] font-black text-red-600 uppercase tracking-widest mt-1">Central SOS MAIS</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-6 overscroll-contain">
        {/* Signal Testing */}
        <section className="bg-slate-900 p-6 rounded-[32px] text-white space-y-4 shadow-xl shadow-slate-900/10 border-b-4 border-red-600">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-red-500 animate-pulse" />
            <h3 className="font-black text-xs uppercase tracking-widest leading-none">Sinal de Vigilância</h3>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed font-bold uppercase">
            Verificar recepção de alertas prioritários no seu terminal.
          </p>
          <button 
            onClick={handleTestNotification}
            disabled={isTestingSignal}
            className={cn(
              "w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3",
              isTestingSignal ? "bg-slate-800 text-slate-400" : "bg-white text-slate-900 hover:bg-slate-100",
              testResult === 'success' && "bg-green-500 text-white hover:bg-green-600",
              testResult === 'denied' && "bg-red-500 text-white hover:bg-red-600"
            )}
          >
            {isTestingSignal ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sincronizando Rede...
              </>
            ) : testResult === 'success' ? (
              <>
                <ShieldCheck className="w-4 h-4" />
                Sinal Confirmado
              </>
            ) : testResult === 'denied' ? (
              <>
                <AlertCircle className="w-4 h-4" />
                Permissão Negada
              </>
            ) : (
              "Disparar Teste de Rede"
            )}
          </button>
          
          <AnimatePresence>
            {testResult === 'denied' && (
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-[9px] text-red-400 font-bold uppercase tracking-tight text-center mt-2"
              >
                Por favor, ative as notificações nas definições do browser.
              </motion.p>
            )}
          </AnimatePresence>
        </section>

        {/* Menu Hub */}
        <div className="space-y-6 pb-4">
          {[
            { label: 'Suporte e Ajuda', items: menuItems.filter(i => ['faq'].includes(i.id)) },
            { label: 'Base Jurídica', items: menuItems.filter(i => ['terms', 'privacy'].includes(i.id)) },
            { label: 'Governança e IA', items: menuItems.filter(i => ['authority', 'ai'].includes(i.id)) },
            { label: 'Outras Políticas', items: menuItems.filter(i => ['cookies', 'copyright', 'return'].includes(i.id)) }
          ].map((group, gIdx) => (
            <div key={gIdx} className="space-y-2">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 mb-2">
                {group.label}
              </h3>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id as Section)}
                  className="w-full bg-white p-5 rounded-[28px] border border-slate-200 flex items-center justify-between hover:border-blue-300 transition-all active:scale-[0.98] group shadow-sm"
                >
                  <div className="flex items-center gap-4 text-left">
                    <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                      <item.icon className="w-5 h-5 text-slate-900 group-hover:text-blue-600 transition-colors" />
                    </div>
                    <div>
                      <h4 className="text-[11px] font-black text-slate-800 uppercase leading-none">{item.title}</h4>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight mt-1">{item.subtitle}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="pt-4 text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-slate-200" />
            <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.4em]">
              SOS MAIS
            </p>
            <div className="h-px w-8 bg-slate-200" />
          </div>
          <p className="text-[8px] text-slate-300 font-bold uppercase tracking-widest leading-tight">
            Central de Transparência Cível<br/>
            Última atualização dos Termos: Julho de 2026
          </p>
        </div>
      </div>
    </div>
  );
}
