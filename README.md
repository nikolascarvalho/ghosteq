# GhostEQ — O EQ que não ocupa slot

_The EQ that takes no slot._

GhostEQ gera arquivos WAV de **impulse response (IR)** que contêm uma curva de EQ. Você carrega esse WAV no bloco de IR do seu modeler (Nano Cortex, Quad Cortex, Helix…) e ganha um EQ sem gastar um slot de efeito. Tudo roda no seu navegador: nenhum áudio sai do seu computador.

> **Status:** etapa 1 (núcleo DSP + testes). Já existe o diagnóstico de entrada ao vivo; o editor de EQ vem nas próximas etapas.

---

## Rodando localmente

Pré-requisito: Node.js 20+ (testado com Node 24). Dentro da pasta `ghosteq/`:

| Comando                 | O que faz                                                                                       | O que esperar                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm install`           | Baixa as dependências para `node_modules/` (como um `pip install -r requirements.txt`).         | Termina com "found 0 vulnerabilities" ou parecido. Só precisa rodar de novo quando o `package.json` mudar.                     |
| `npm run dev`           | Sobe o servidor de desenvolvimento com recarga automática.                                      | Mostra `Local: https://localhost:5173/` e `Network: https://192.168.x.x:5173/`. Fica rodando até `Ctrl+C`.                     |
| `npm run dev:http`      | Mesmo servidor, mas em HTTP puro em `http://localhost:5174`, só no próprio PC.                  | Útil se o aviso de certificado atrapalhar. Não funciona no celular (fora de localhost o navegador bloqueia o áudio sem HTTPS). |
| `npm run typecheck`     | Checa os tipos do TypeScript (como um mypy rigoroso).                                           | Sem saída = tudo certo.                                                                                                        |
| `npm run build`         | Typecheck + gera a versão de produção em `dist/`.                                               | Lista os arquivos gerados e "built in …ms".                                                                                    |
| `npm run preview`       | Serve a pasta `dist/` como em produção.                                                         | URL em `https://localhost:4173/`.                                                                                              |
| `npm run make-test-irs` | Gera WAVs de teste em `test-irs/` com o mesmo código do app (flat, corte em 3 kHz, +9 dB etc.). | Uma linha por arquivo com formato (pcm24/float32) e pico. A pasta não vai para o git.                                          |

### Testes, lint e formatação

| Comando                | O que faz                                                      | O que esperar                                             |
| ---------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| `npm test`             | Roda todos os testes uma vez (Vitest, equivalente ao pytest).  | `Test Files N passed` / `Tests N passed` em menos de 2 s. |
| `npm run test:watch`   | Fica observando os arquivos e reroda os testes a cada mudança. | Útil enquanto se edita o DSP. `q` para sair.              |
| `npm run lint`         | ESLint: procura bugs e más práticas (como flake8/ruff).        | Sem saída = tudo certo.                                   |
| `npm run format`       | Prettier: reformata o código (como black).                     | Reescreve arquivos; rode antes de commitar.               |
| `npm run format:check` | Só confere se está formatado (é o que o CI roda).              | "All matched files use Prettier code style!"              |

O **CI** ([.github/workflows/ci.yml](.github/workflows/ci.yml)) roda, a cada push, na ordem: `npm ci` → lint → format:check → typecheck → testes → build. Se qualquer etapa falhar, o push fica marcado em vermelho no GitHub.

### Por que HTTPS no dev server (e o aviso de certificado)

O navegador só libera microfone/entrada de áudio e service worker (PWA) em **contexto seguro**: `https://` ou `localhost`. Para abrir o app no celular pela rede local (`https://192.168.x.x:5173`) precisamos de HTTPS, então o dev server usa um certificado autoassinado gerado pelo `@vitejs/plugin-basic-ssl`.

Na primeira vez o navegador vai mostrar **"Sua conexão não é particular"**. É esperado (o certificado não foi emitido por uma autoridade). Clique em **Avançado → Continuar para…**. No iPhone (Safari): **Mostrar detalhes → visitar este site**.

### Testando no celular

1. PC e celular na **mesma rede Wi-Fi**.
2. `npm run dev` no PC e copie o endereço `Network: https://192.168.x.x:5173/`.
3. Abra esse endereço no celular e aceite o aviso de certificado.
4. Se não abrir: o Firewall do Windows pode estar bloqueando o Node. Na primeira execução o Windows pergunta; marque **Redes privadas** e permita. Confira também se a rede do Windows está como "Privada", não "Pública".

---

## /diagnostico — teste de entrada ao vivo

Página que responde à pergunta mais arriscada do projeto: **o navegador enxerga os canais 3/4 do Nano Cortex** (onde está o sinal processado)?

### Preparar o Windows

1. Conecte o Nano via USB e abra **Configurações → Sistema → Som → Mais configurações de som** (ou `mmsys.cpl`).
2. Aba **Gravação**: o Nano Cortex precisa aparecer e estar **ativado** (botão direito → Ativar, se estiver desativado).
3. **Feche DAWs e apps que estejam usando o Nano** (Reaper, Cubase, Cortex Control, etc.). Um app em modo exclusivo ou via ASIO pode "segurar" o dispositivo e o navegador recebe erro de dispositivo ocupado.
4. Se mesmo assim der conflito: na aba Gravação, Nano → **Propriedades → Avançado** → desmarque **"Permitir que aplicativos assumam controle exclusivo deste dispositivo"**. Na mesma aba confira o formato padrão (o ideal é 48000 Hz).

### Usar a página

1. `npm run dev` e abra `https://localhost:5173/diagnostico` no **Chrome** e depois no **Edge**.
2. **Pedir permissão** → aceite o acesso ao microfone.
3. Escolha o Nano na lista, mantenha "Mapeamento esperado = Nano Cortex" e clique **Abrir dispositivo**.
4. Toque guitarra e veja quais medidores acendem. Canal 1 = DI seca, canais 3/4 = processado.
5. Clique **Copiar relatório** e cole o JSON na conversa.

O que cada número significa:

- **Canais que realmente chegam (medido)**: contados por um AudioWorklet na thread de áudio. É o número confiável.
- **getSettings / getCapabilities**: o que o navegador diz que negociou / suporta.
- **channelCount do MediaStreamAudioSourceNode**: atributo de configuração do nó (costuma ser 2 por padrão e não prova nada sozinho; está aqui porque foi pedido explicitamente).
- **Latências**: `baseLatency` (processamento do AudioContext) + `outputLatency` (até a saída) + latência de entrada informada pela trilha (só Chrome/Edge). Soma = estimativa de ida e volta.

### Se só chegarem 2 canais (workarounds)

O navegador não usa ASIO, só o driver padrão do Windows (WASAPI), e muitas vezes ele entrega apenas o par 1/2. Alternativas, da mais simples para a mais robusta:

1. **Roteamento no próprio aparelho/driver**: se o Nano (ou o painel do driver) permitir escolher o que vai no par USB 1/2, mande o sinal processado para 1/2 durante o ajuste.
2. **VoiceMeeter (Banana/Potato, grátis)**: ele lê o Nano via ASIO (todos os canais), você roteia os canais 3/4 para uma entrada virtual "VoiceMeeter Output", e no navegador escolhe essa entrada virtual. Adiciona alguns ms de latência.
3. **Gravar e importar**: grave a saída processada (3/4) numa DAW com IR flat e use o modo de upload de gravação (etapa do motor de áudio).

---

## Arquitetura (uma camada por vez)

O app é 100% client-side: é um site estático, sem servidor. As camadas dependem só "de cima para baixo" (`ui → state → workers/audio → dsp/io/config`), como num pipeline em que a camada de apresentação nunca é importada pela camada de transformação.

- **`src/config/`** — Dados de configuração, sem lógica. `devices.ts` lista os aparelhos (sample rate, tamanho do IR, mapeamento USB). É a "tabela de dimensão" dos aparelhos.
- **`src/i18n/`** — Textos em PT-BR e EN. `pt-BR.ts` define as chaves (o "schema"); `en.ts` é obrigado pelo TypeScript a ter as mesmas chaves, então nunca falta tradução sem o build avisar. O hook `useT()` devolve a função `t('chave')`.
- **`src/audio/`** — Tudo que fala com a Web Audio API (o "motor de áudio" do navegador). Por enquanto, `liveInput.ts` abre a entrada com as configurações cruas (sem cancelamento de eco, supressão de ruído ou ganho automático, que destruiriam o timbre) e monta o grafo de medição. `worklets/channel-probe.worklet.js` roda dentro da thread de áudio e conta os canais reais.
- **`src/dsp/`** — O "motor matemático". Só funções puras (entrada → saída, sem estado global, sem tela, sem áudio do navegador), como uma biblioteca Python de transformação que se testa com pytest sem subir nada. O lint proíbe esta pasta de importar React ou usar `window`/`document`. Conteúdo:
  - `biquad.ts`: fórmulas do _Audio EQ Cookbook_ (RBJ) que transformam "peak 3 kHz, -5 dB, Q 1,4" em 5 coeficientes. HPF/LPF de 24 dB/oitava = 2 biquads (Butterworth de 4ª ordem).
  - `cascade.ts`: aplica uma lista de biquads em sequência a um sinal (um pipeline de transformações).
  - `ir.ts`: gera o IR passando um impulso (1, 0, 0, …) pela cascata, corta no tamanho do aparelho e aplica um fade (meia janela de Hann) nas últimas 64 amostras para o final chegar a 0 sem "degrau".
  - `fft.ts` / `response.ts`: FFT própria e as duas curvas do gráfico, a **alvo** (calculada pelas fórmulas) e a **real** (medida no IR truncado).
  - `deviation.ts`: compara alvo × real e aponta as regiões com mais de 1 dB de diferença.
  - `convolve.ts`: convolução (direta para IRs curtos, via FFT para sinais longos). Vai servir para juntar IR de caixa + EQ.
  - `resample.ts`: muda a taxa de amostragem (ex.: IR de caixa de 44,1 kHz → 48 kHz) com sinc janelado (Kaiser). `resampleIr` corrige o ganho e preserva as "pontas" do filtro para a curva não mudar.
  - `target.ts`: ponto de extensão da v2 ("curva desenhada → IR"), por enquanto só tipos.
- **`src/model/`** — O "schema" da fonte da verdade: o tipo `CurveConfig` (modo, bandas, ganho de saída, aparelho) com `schemaVersion`. Fica numa camada própria, abaixo de `state/` e `io/`, porque os dois dependem dele, como um contrato de dados compartilhado entre o job que escreve e o que lê.
- **`src/io/`** — Entrada e saída de arquivos e do banco local:
  - `wavEncode.ts` / `wavDecode.ts`: escrevem e leem WAV. A exportação usa 24-bit PCM por padrão e **troca sozinha para 32-bit float** quando o pico passa de 1.0, porque PCM inteiro cortaria (clip) o sinal. A leitura aceita 8/16/24/32-bit, float e o formato "extensible", e ignora chunks extras (metadados), como fazem os players.
  - `presetsJson.ts`: salvar e abrir presets `.json`. Ao ler, aplica **migrações** de versões antigas do schema (v1 → v2 → …), igual a _schema evolution_ num data lake, e depois **valida**: tipos desconhecidos são recusados e valores fora da faixa são ajustados com aviso. Preset de versão mais nova que o app é recusado.
  - `presetsDb.ts`: guarda presets no **IndexedDB**, o banco embutido do navegador, que fica no aparelho e nunca vai para servidor. Ao carregar, passa pela mesma migração/validação.
  - `fileName.ts`: nome automático do WAV, ex.: `EQ_3k-5dB_+9dB_Nano1024.wav` (as 3 bandas de maior impacto, o ganho de saída e o aparelho com o tamanho).
  - `files.ts`: download de arquivo gerado no navegador e leitura de arquivo escolhido pelo usuário.
- **`tests/`** — Testes Vitest espelhando `src/`. `tests/integration/` simula o modeler: convolui ruído branco com o IR e mede, só pela entrada e saída, se a curva aplicada é a esperada.
- **`src/ui/`** — Componentes React: só desenham a tela e repassam cliques. Nenhuma conta de DSP mora aqui.

_(As camadas `dsp/`, `io/`, `state/` e `workers/` serão documentadas aqui conforme forem criadas.)_

---

## Por que 1024 amostras limitam o grave

Um IR de 1024 amostras a 48 kHz dura só **~21 ms**. Um filtro "lembra" o som por um tempo que depende da frequência e da largura: quanto mais grave e mais estreito, mais longa é a "cauda" da resposta. Um corte estreito em 40 Hz, por exemplo, precisa de bem mais de 21 ms para se completar. Quando o IR é cortado, essa cauda some e o filtro fica "pela metade": a curva real no grave sai mais rasa e mais larga do que a pedida.

Analogia: é como calcular uma média móvel de 30 dias tendo só 7 dias de dados. Para variações rápidas (agudos, médios) 7 dias bastam; para tendências lentas (grave) não.

Na prática, com 1024 amostras:

- médios e agudos (acima de ~300 Hz) ficam praticamente exatos;
- shelves e cortes largos no grave funcionam razoavelmente;
- cortes **estreitos** e shelves abaixo de ~150 Hz ficam imprecisos. O app mostra a curva real sobreposta à pedida e avisa quando a diferença passa de 1 dB.

O Helix (2048 amostras, ~43 ms) tem o dobro de "memória" e é mais preciso no grave (há um teste automatizado que confirma isso).

---

## Como adicionar um preset de aparelho

Edite [`src/config/devices.ts`](src/config/devices.ts) e acrescente um item em `DEVICE_PRESETS`:

```ts
{
  id: 'meu-aparelho',          // identificador único, sem espaços
  name: 'Fabricante Modelo',   // nome exibido
  sampleRate: 48000,           // sample rate em que o aparelho usa o IR
  irLength: 1024,              // tamanho final do IR em amostras
  usb: { processed: [3, 4], di: 1 }, // opcional: canais USB (começando em 1)
},
```

Nada mais precisa mudar: telas e exportação leem essa lista.

---

## Amostras de áudio

Veja [`public/samples/README.md`](public/samples/README.md) para o formato dos loops de exemplo.
