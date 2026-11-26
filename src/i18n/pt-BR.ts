// Dicionário de referência. As chaves daqui definem o "schema" dos textos:
// en.ts precisa ter exatamente as mesmas chaves (o TypeScript acusa se faltar).
export const ptBR = {
  'app.slogan': 'O EQ que não ocupa slot',
  'app.wip': 'Em construção. Por enquanto só a página de diagnóstico está pronta.',
  'nav.home': 'Início',
  'nav.diagnostics': 'Diagnóstico de entrada',
  'lang.label': 'Idioma',

  'diag.title': 'Diagnóstico de entrada de áudio',
  'diag.intro':
    'Verifica quantos canais do seu aparelho chegam ao navegador e qual a latência. Nada sai do seu computador.',
  'diag.step1': '1. Permitir acesso ao áudio',
  'diag.askPermission': 'Pedir permissão',
  'diag.permissionOk': 'Permissão concedida.',
  'diag.step2': '2. Escolher o dispositivo de entrada',
  'diag.noDevices': 'Nenhum dispositivo de entrada encontrado.',
  'diag.refresh': 'Atualizar lista',
  'diag.open': 'Abrir dispositivo',
  'diag.close': 'Fechar',
  'diag.step3': '3. Resultado',
  'diag.channelsTrack': 'Canais informados pela trilha (getSettings)',
  'diag.channelsCaps': 'Máximo de canais anunciado (getCapabilities)',
  'diag.channelsNode': 'channelCount do MediaStreamAudioSourceNode',
  'diag.channelsReal': 'Canais que realmente chegam ao áudio (medido)',
  'diag.sampleRateCtx': 'Sample rate do AudioContext',
  'diag.sampleRateTrack': 'Sample rate da trilha',
  'diag.baseLatency': 'baseLatency',
  'diag.outputLatency': 'outputLatency',
  'diag.trackLatency': 'Latência de entrada da trilha',
  'diag.totalLatency': 'Total estimado (base + saída + entrada)',
  'diag.unavailable': 'não informado',
  'diag.measuring': 'medindo…',
  'diag.meters': 'Nível por canal',
  'diag.meterHint': 'Toque no instrumento: o canal com sinal deve acender.',
  'diag.channel': 'Canal {n}',
  'diag.roleDI': 'DI seca',
  'diag.roleProcessed': 'processado',
  'diag.devicePreset': 'Mapeamento esperado',
  'diag.none': 'Nenhum',
  'diag.verdictOk': '{n} canais chegando. Os canais 3/4 do Nano estão acessíveis.',
  'diag.verdictTwo':
    'Só {n} canal(is) chegando. O navegador não está entregando os canais 3/4. Veja as alternativas no README (VoiceMeeter ou roteamento no driver).',
  'diag.copyReport': 'Copiar relatório',
  'diag.copied': 'Relatório copiado. Cole na conversa.',
  'diag.errorPrefix': 'Erro',
  'diag.errNotAllowed': 'Permissão negada. Libere o microfone no cadeado da barra de endereço.',
  'diag.errNotReadable':
    'O dispositivo está ocupado. Feche DAW/apps que usem o aparelho em modo exclusivo e tente de novo.',
  'diag.errOverconstrained': 'O dispositivo não aceitou as configurações pedidas.',
  'diag.errInsecure': 'Esta página precisa de HTTPS (ou localhost) para acessar o áudio.',
  'diag.noMonitor': 'A entrada não é enviada para os alto-falantes (sem risco de microfonia).',
} as const;

export type MessageKey = keyof typeof ptBR;
export type Messages = { [K in MessageKey]: string };
