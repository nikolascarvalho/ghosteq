# Projeto: GhostEQ — o EQ que não ocupa slot

> Contexto permanente do projeto (prompt original, aprovado). A seção "Decisões
> aprovadas" no fim registra os ajustes feitos depois do plano e prevalece
> sobre o texto original quando houver conflito.

## 1. Contexto

Nome do produto: **GhostEQ** (slogan: "O EQ que não ocupa slot" / "The EQ that takes no slot"). Usar esse nome no repositório, no package.json, no manifest do PWA e no README.

App web instalável (PWA) que gera arquivos WAV de impulse response (IR) contendo uma curva de EQ, para carregar no bloco de IR de modeladores de guitarra (Neural DSP Nano Cortex / Quad Cortex, Line 6 Helix etc.) e assim economizar um slot de efeito.

- Público: guitarrista com modeler pequeno que já lotou os slots de efeito.
- Uso: no navegador do PC (inclusive com o modeler ligado via USB para ajuste ao vivo) e instalado no celular (mobile-first, toque).
- Privacidade: todo o processamento roda no navegador. Sem backend, nada é enviado para servidor.

### Sobre o usuário

Engenheiro de dados (Python, Spark, SQL, CI/CD). Não conhece desenvolvimento front-end nem arquitetura de apps web/mobile. Então:

- Explicar decisões em linguagem simples (analogias com engenharia de dados são bem-vindas).
- Ao criar cada camada/módulo, escrever um parágrafo curto no README explicando o que ela faz e por quê.
- Dizer exatamente quais comandos rodar e o que esperar de cada um.

### Conhecimento de domínio já validado (não reinventar)

- Um IR só reproduz processos lineares e invariantes no tempo (EQ, filtros, caixa+mic, tone stack com knobs fixos, wah parado). Não reproduz drive, compressor, modulação, reverb/delay longos.
- Nano Cortex / Quad Cortex: o Cloud redimensiona qualquer WAV para 1024 amostras a 48 kHz (~21 ms). Helix: 2048 amostras a 48 kHz.
- Com 1024 amostras, a resolução no grave é limitada: cortes estreitos e shelves abaixo de ~150 Hz ficam imprecisos. Médios e agudos ficam precisos.
- IR com ganho > 0 dB tem amostra de pico > 1.0, o que estoura em PCM inteiro. Na prática, um IR em 32-bit float com +9 dB funcionou no Nano Cortex.
- No Nano, o bloco de IR fica depois do capture (amp) e antes dos efeitos pós.
- Nano Cortex como interface USB: 24-bit, 48 kHz fixo, 4 entradas / 3 saídas USB. USB in 1 = DI seca; USB in 3/4 = sinal processado (amp + caixa + efeitos). No Windows, DAWs usam driver ASIO, mas o navegador não usa ASIO, só o driver padrão do sistema. O Nano também faz monitoramento direto pelas saídas físicas.

## 2. Stack

- Vite + React + TypeScript
- Zustand para estado global
- vite-plugin-pwa (manifest + service worker, funciona offline)
- DSP próprio em TypeScript (sem libs pesadas); Web Audio API para preview/ao vivo
- Vitest para testes
- i18n PT-BR e EN desde o início (solução simples própria)
- Deploy estático: GitHub + Cloudflare Pages, com URL de preview por branch

## 3. Arquitetura

100% client-side. Camadas com dependência só de cima para baixo:

```
src/
  ui/          Componentes React (sem lógica de DSP)
  state/       Store Zustand — fonte da verdade = config da curva em JSON
  dsp/         Funções PURAS: biquads, geração de IR, truncamento, FFT,
               convolução, resample. Zero dependência de DOM/React.
  workers/     Web Worker que executa o DSP fora da thread da UI
  audio/       Grafo Web Audio: entrada ao vivo, convolver, A/B,
               analisador, limiter
  io/          WAV encoder/decoder, import/export de presets JSON,
               persistência em IndexedDB
  config/
    devices.ts Presets de aparelho (sample rate, tamanho do IR,
               mapeamento de canais USB)
  i18n/        Textos PT-BR / EN
```

- Config da curva = JSON tipado com campo `schemaVersion` (ex.: `{ schemaVersion, bands: [...], outputGainDb, devicePresetId }`).
- Fluxo: usuário arrasta banda → estado muda → worker recalcula IR com debounce (~30 ms) → (a) gráfico atualiza; (b) buffer do ConvolverNode é trocado; (c) exportação usa exatamente esse IR.
- Layout responsivo mobile-first; Pointer Events para unificar mouse e toque.
- Testar cedo no Safari do iOS (mais restritivo com áudio/PWA).

## 4. Passo 0 — Spike de entrada ao vivo (FAZER ANTES DE TUDO)

Risco principal: o navegador pode expor só 2 canais do dispositivo, e no Nano o sinal processado está no 3/4.

Página mínima de diagnóstico (rota `/diagnostico`, que depois vira feature permanente) que:

- Peça permissão de microfone e liste dispositivos (`enumerateDevices`).
- Abra `getUserMedia` com o `deviceId` escolhido, `channelCount` máximo possível, `echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`, latência mínima.
- Use `AudioContext` com `sampleRate: 48000` e `latencyHint: "interactive"`.
- Mostre quantos canais chegaram (`track.getSettings().channelCount` e `MediaStreamAudioSourceNode.channelCount`) e um medidor de nível POR CANAL (`ChannelSplitterNode` + `AnalyserNode`).
- Mostre `baseLatency` + `outputLatency`.

O usuário testa no Chrome e no Edge (Windows) com o Nano Cortex e reporta. Se só chegarem 2 canais, documentar workarounds (VoiceMeeter, roteamento no mixer do driver) e seguir com o design abaixo.

## 5. Escopo do MVP

### 5.1 Editor de curva

- Bandas arrastáveis no gráfico (frequência × ganho; Q via scroll/pinch ou slider): peak, low shelf, high shelf, HPF, LPF (12/24 dB/oct), notch. Mínimo de 6 bandas.
- Gráfico log de 20 Hz a 20 kHz, ±18 dB.
- Ligar/desligar banda, resetar, desfazer/refazer.

### 5.1b Modos de EQ (todos compilam para a MESMA lista de biquads)

- Paramétrico (padrão): bandas arrastáveis.
- Gráfico: sliders verticais com Q proporcional (Q aumenta com o ganho). Variantes:
  - 9 bandas espelhando as frequências do bloco Graphic-9 do Nano Cortex (em config). Objetivo: reproduzir no IR um preset que o usuário já usa no aparelho.
  - 10 bandas (oitavas ISO: 31,5 Hz a 16 kHz).
  - 31 bandas (1/3 de oitava ISO: 20 Hz a 20 kHz).
- Tone stack / simples: grave (low shelf), médio (peak, frequência selecionável), agudo (high shelf), presença (peak ~4–5 kHz), + HPF/LPF. Visual de knobs de amp.
- Tilt: um controle (±6 dB) que inclina o espectro em torno de ~800 Hz (par low shelf + high shelf complementares).
- Conversão entre modos: gráfico/tone stack/tilt → paramétrico sem perda; paramétrico → gráfico é aproximação (avisar antes).
- O modo fica salvo no JSON: `mode: "parametric" | "graphic9" | "graphic10" | "graphic31" | "tonestack" | "tilt"`.
- Indicador "imprecisa neste aparelho": bandas/controles cujo efeito real (após truncar) desvie mais de 3 dB do pedido recebem marcação visual com tooltip.
- Cada modo é um "compilador" puro em `src/dsp/modes/` que recebe o estado do modo e devolve a lista de biquads. Testar cada um no Vitest.

### 5.2 Geração do IR

- Coeficientes biquad pelo RBJ Audio EQ Cookbook.
- Impulso unitário pela cascata de biquads → IR de fase mínima naturalmente (sem latência).
- Truncar no tamanho do preset do aparelho com fade-out curto (meia janela Hann nas últimas amostras).

### 5.3 Curva REAL × curva desejada (crucial)

- FFT do IR já truncado plotada sobre a curva alvo.
- Aviso quando o desvio passar de ~1 dB em alguma região (especialmente no grave), com explicação simples da limitação de 1024 amostras.

### 5.4 Presets de aparelho (`config/devices.ts`)

- Nano Cortex / Quad Cortex: 48 kHz, 1024 amostras; USB: processado = 3/4, DI = 1.
- Line 6 Helix / HX: 48 kHz, 2048 amostras.
- Customizado: sample rate e tamanho livres.
- Fácil de editar e documentado no README.

### 5.5 Ganho de saída

- Controle de ganho com medidor de pico da amostra máxima.
- Pico > 1.0: exportar em 32-bit float e avisar. Caso contrário, oferecer 24-bit PCM (padrão) ou float.

### 5.6 Juntar com IR de caixa (feature principal)

- Importar WAV de caixa (qualquer sample rate, mono; se estéreo, usar L ou somar, com aviso).
- Resample para 48 kHz se preciso, passar pela cascata (ou convoluir), truncar no tamanho do preset.
- Mostrar curva da caixa original, do EQ e combinada.

### 5.7 Preview e modo ao vivo (Web Audio)

- Grafo: fonte → [ConvolverNode (`normalize = false`) com o IR EXATO exportado] e [caminho direto] → A/B por crossfade de ~20 ms → limiter de segurança → saída.
- Toggle "compensar volume no A/B" (iguala RMS; não altera o arquivo exportado).
- Fontes: (1) entrada ao vivo (seletor de dispositivo e canal/par, presets de mapeamento, latência na tela); (2) upload de gravação do usuário; (3) 2–3 loops de exemplo JÁ AMPLIFICADOS (nunca DI crua).
- Saída: `setSinkId` quando disponível.
- Avisos: zerar/desconectar saídas físicas do modeler; IR flat e efeitos pós desligados no modeler; latência do navegador não é ideal para tocar.
- Segurança: botão de pânico (mute) sempre visível e limiter na saída.
- Analisador de espectro ao vivo com sobreposição antes/depois.

### 5.8 Exportação e presets

- WAV mono com nome descritivo (ex.: `EQ_3k-5dB_+9dB_Nano1024.wav`).
- Presets de curva em JSON (IndexedDB + export/import de arquivo).

### 5.9 PWA

- Manifest com nome, ícones e cor; botão "Instalar app".
- Service worker com cache dos arquivos do app (offline).

## 6. Fora do MVP (v2 — não implementar, mas não bloquear na arquitetura)

- Match EQ (referência + gravação → curva de correção suavizada).
- Desenho livre de curva → IR via FIR de fase mínima (cepstrum/Hilbert). Núcleo DSP preparado para "curva-alvo → IR" além de "biquads → IR".
- Fase linear opcional. Presets prontos (cocked wah, tone stacks clássicos etc.). Capacitor para lojas. Contas/compartilhamento (Supabase) só se houver demanda.

## 7. Qualidade e testes

- Vitest no núcleo DSP: magnitude do IR longo = resposta analítica ±0,1 dB; IR flat = Dirac; +9 dB → pico ≈ 2,818 e float automático; truncamento + fade sem descontinuidade; WAV writer 24-bit/float validado relendo; resample 44.1→48 dentro de tolerância; compiladores de modo; Q proporcional (vizinhos +6 dB ≤ ~+7,5 dB); gráfico → paramétrico exato.
- Integração: ruído branco convoluído com o IR reproduz a curva-alvo.
- Lint + typecheck + testes no CI (GitHub Actions) a cada push.

## 8. Como trabalhar

1. Plano aprovado antes de codar.
2. Ordem (ajustada): Passo 0 (spike) → núcleo DSP + testes → I/O (WAV) → estado → UI do editor paramétrico → modos de EQ → **cab merge → motor de áudio/ao vivo** → PWA → deploy.
3. Commits pequenos e descritivos, um por etapa lógica.
4. README: rodar local, testar, deploy, adicionar preset de aparelho, limitação de 1024 amostras, um parágrafo por camada.
5. Ao fim de cada etapa: o que testar manualmente (inclusive no Nano Cortex) e o resultado esperado.

## Decisões aprovadas (prevalecem)

1. Loops de exemplo: placeholders sintéticos só para desenvolvimento. O usuário vai gravar 3 loops reais (clean/crunch/high gain) pelo USB 3/4 do Nano com IR flat; `public/samples/README.md` explica o formato (WAV 48 kHz, mono ou estéreo, 10–20 s, normalizado a -1 dBFS).
2. Frequências do Graphic-9 do Nano: NÃO pesquisar na web — perguntar ao usuário na etapa 5.
3. Dev server em HTTPS (`@vitejs/plugin-basic-ssl`) com `--host`, para testar no celular pela rede local. Documentado no README.
4. Modo ao vivo: volume de saída começa em -12 dB toda vez que o modo é ligado; teto de saída -1 dBFS. Desde o Lote 9 a proteção é um AudioWorklet próprio sem lookahead (pico por amostra, attack 0, release ~50 ms, hard clip em -1 dBFS; 0 amostras de atraso), no lugar de DynamicsCompressor + WaveShaper 4x (que somavam 10 ms).
5. README do /diagnostico (Windows): Nano ativo como dispositivo de gravação em Som do Windows; fechar DAW/apps que usem o Nano em modo exclusivo; desmarcar "Permitir que aplicativos assumam controle exclusivo" se houver conflito.
6. Cab merge vem antes do motor de áudio/ao vivo.
7. Repositório privado, sem arquivo de licença por enquanto.
8. Projeto vive na subpasta `ghosteq/` (a pasta-mãe tem arquivos não relacionados).
9. Bibliotecas pequenas aprovadas: `wouter` (rotas), `idb-keyval` (IndexedDB). i18n é solução própria.
10. TypeScript fixado em 6.0.x: o TypeScript 7 (compilador nativo) não tem a API JS que o typescript-eslint usa. Só subir para 7 quando o typescript-eslint suportar.
11. Resultado do spike com Focusrite Scarlett 2i2 (1ª geração), Chrome 158/Windows: 2/2 canais, 48 kHz, sem processamento de voz, latência total ~70 ms (saída 50 ms). Teste com o Nano (canais 3/4) ainda pendente.
12. Graphic-9 do Nano Cortex (confirmado pelo usuário no app Cortex Mobile): 65, 125, 250, 500 Hz, 1, 2, 4, 8, 16 kHz, mais HPF, LPF e OUTPUT. Q interno do Nano desconhecido; o GhostEQ usa Q proporcional + correção para a curva bater com os sliders.
13. Modos não paramétricos guardam os controles em `modeState` e `bands` é sempre a lista compilada. O nome do WAV nesses modos usa os valores dos controles (ex.: `GEQ9_65+8_1k-6_...`), não as bandas internas.
14. PWA com `registerType: 'prompt'` (o app nunca recarrega sozinho; aviso "Nova versão → Atualizar"). Loops `/samples/*.wav` em cache só quando tocados (runtime CacheFirst), fora do precache. Service worker desligado no dev.
15. Lote 9 (latência ao vivo, foco Windows/Chrome/Edge): modo "Baixa latência" (`latencyHint: 0`) é padrão ligado no Windows e fica salvo no `localStorage`; estalos vêm de `AudioContext.playbackStats` quando existir. Saída pelo Nano é só experimental, nunca padrão. Não haverá app nativo: tudo continua no PWA.
