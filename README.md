# GhostEQ — O EQ que não ocupa slot

_The EQ that takes no slot._

GhostEQ gera arquivos WAV de **impulse response (IR)** que contêm uma curva de EQ. Você carrega esse WAV no bloco de IR do seu modeler (Nano Cortex, Quad Cortex, Helix…) e ganha um EQ sem gastar um slot de efeito. Tudo roda no seu navegador: nenhum áudio sai do seu computador.

> **Status:** MVP completo (etapas 0–9): editor paramétrico, gráfico 9 (Nano)/10/31, tone stack, tilt, caixa + EQ, exportação do WAV, escuta A/B ao vivo, app instalável e offline, deploy no Cloudflare (Workers com arquivos estáticos).

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
| `npm run preview:http`  | Serve o build de produção (`dist/`) em `http://localhost:4174`, sem HTTPS.                      | Para testar a PWA/offline no próprio PC. Rode `npm run build` antes.                                                           |
| `npm run icons`         | Regera os ícones PNG a partir de `public/icon.svg`.                                             | Lista os arquivos gerados em `public/`. Só precisa ao mudar o ícone.                                                           |

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

## Deploy (GitHub + Cloudflare Workers)

O GhostEQ é um **site estático**: o build (`npm run build`) gera a pasta `dist/` com HTML, JS e ícones, e qualquer hospedagem de arquivos serve. Não há servidor nem banco. Usamos o **Cloudflare Workers com arquivos estáticos** (grátis, HTTPS automático) ligado ao GitHub pelo **Workers Builds**. Funciona como um pipeline de CI/CD: cada `git push` dispara um build na nuvem e publica.

Por que Worker e não Cloudflare Pages: o projeto foi criado no painel como Worker, e hoje é o caminho que o próprio Cloudflare recomenda para sites novos. Para um site estático o resultado é o mesmo (arquivos de `dist/` servidos pela rede do Cloudflare). O Worker aqui **não tem código nosso**, só serve arquivos.

O arquivo **`wrangler.jsonc`** (na raiz) é a "config do job" do deploy, como um YAML de pipeline:

- `assets.directory: "./dist"`: a pasta que vai ao ar.
- `not_found_handling: "single-page-application"`: qualquer caminho que não é um arquivo (ex.: `/diagnostico`) recebe o `index.html`, e o app decide a tela.
- `previews: {}`: obrigatório para o deploy de branches (`npx wrangler preview`). Vazio = a preview usa as mesmas configurações da produção.

Sem esse arquivo, o deploy da `main` até funcionava (o `wrangler deploy` improvisava uma config na hora), mas o das outras branches falhava com "missing a `previews` block".

### 1. Repositório no GitHub (uma vez)

1. Em <https://github.com/new>: nome `ghosteq`, **Private**, e **sem** README, .gitignore ou licença (o projeto já tem os arquivos).
2. Na pasta `ghosteq/`:
   ```powershell
   git remote add origin https://github.com/SEU_USUARIO/ghosteq.git
   ```
   ```powershell
   git push -u origin main
   ```
   Na primeira vez o Windows abre o navegador para você entrar no GitHub (Git Credential Manager).
3. Na aba **Actions** do repositório roda o **CI** (lint → formatação → typecheck → testes → build). O esperado é um ✓ verde em ~1–2 min.

### 2. Cloudflare Workers (uma vez — já feito)

1. Em <https://dash.cloudflare.com> (conta grátis): **Workers & Pages → Create → Workers → Import a repository** (conectar ao GitHub; os nomes dos menus podem variar um pouco).
2. Autorize o app do Cloudflare no GitHub **dando acesso ao repositório `ghosteq`** (por ser privado, precisa marcar explicitamente).
3. Configuração do build (em **ghosteq → Settings → Builds**, que tem duas abas):

   | Aba           | Campo                       | Valor                  |
   | ------------- | --------------------------- | ---------------------- |
   | Production    | Production branch           | `main`                 |
   | Production    | Build command               | `npm run build`        |
   | Production    | Deploy command              | `npx wrangler deploy`  |
   | Previews Base | Builds for Preview branches | ligado                 |
   | Previews Base | Build command               | `npm run build`        |
   | Previews Base | Preview command             | `npx wrangler preview` |
   | as duas       | Root directory              | `/`                    |

   A versão do Node (22) vem do arquivo `.node-version`. A pasta de saída (`dist`) não é configurada no painel: vem do `wrangler.jsonc`.

4. **Deploy.** Em ~2 min o app está em <https://ghosteq.nhc-1997.workers.dev>.

### 3. Dia a dia

- `git push` na `main` → o Cloudflare publica a versão nova em produção. Quem tem o app aberto vê "Nova versão → Atualizar".
- **Preview por branch:** qualquer outra branch vira um site de teste próprio, sem mexer na produção:
  ```powershell
  git switch -c teste-novo-modo
  ```
  ```powershell
  git push -u origin teste-novo-modo
  ```
  O build da branch roda `npx wrangler preview` e publica um endereço próprio: o nome da branch com `/` trocada por `-`, mais `-ghosteq.nhc-1997.workers.dev`. Ex.: a branch `claude/cloudflare-worker-deploy` virou <https://claude-cloudflare-worker-deploy-ghosteq.nhc-1997.workers.dev>. Cada push na branch atualiza o mesmo endereço. No pull request, o check **Workers Builds: ghosteq** fica verde e o link **Details** leva ao build no painel, com o endereço da preview.
- Endereços de preview são **públicos** (qualquer um com o link abre). Como o app não guarda dados de ninguém no servidor, tudo bem; se um dia precisar fechar, o Cloudflare Access resolve.
- `public/_headers` controla o cache: `index.html`, `sw.js` e o manifest sempre são revalidados, e os arquivos com hash no nome ficam em cache por 1 ano. Também restringe o microfone ao próprio site. Ele vai para `dist/` no build e o Cloudflare aplica (produção e previews).
- Rotas como `/diagnostico` funcionam por causa do `not_found_handling: "single-page-application"` no `wrangler.jsonc`. Detalhe: o Cloudflare só entrega o `index.html` quando é o **navegador abrindo a página** (cabeçalho `Sec-Fetch-Mode: navigate`). Um `curl` simples em `/diagnostico` recebe 404, e isso é normal. A vantagem: um arquivo que não existe (ex.: `/assets/velho.js`) dá 404 de verdade, em vez de HTML disfarçado de JS.
- Testar a config sem publicar (opcional): `npm run build` e depois `npx wrangler deploy --dry-run`. O esperado é "Read N files from the assets directory … dist" e "--dry-run: exiting now".

---

## Instalar como app (PWA) e usar offline

O GhostEQ é uma **PWA** (Progressive Web App): um site que pode ser instalado como app e funciona **sem internet**. Como todo o processamento já roda no aparelho, offline ele faz tudo: editar, ouvir, juntar caixa e exportar.

- **Chrome/Edge (PC) e Android:** aparece o botão **⤓ Instalar app** no topo (ou o ícone de instalar na barra de endereço). O app ganha ícone próprio e abre em janela separada.
- **iPhone/iPad (Safari):** a Apple não permite um botão de instalar; o botão mostra as instruções (Compartilhar → "Adicionar à Tela de Início").
- **Offline:** na primeira visita, o **service worker** guarda o app inteiro no aparelho (HTML, código, worker de DSP, worklet de áudio, ícones). Analogia: um cache local versionado de todos os artefatos do build. Aparece o aviso "Pronto: o GhostEQ agora funciona offline". Os loops de exemplo (WAVs grandes) não entram nesse pacote: ficam guardados na primeira vez que tocam.
- **Atualizações:** quando sai um deploy novo, aparece "Nova versão disponível → Atualizar". O app nunca recarrega sozinho, para não cortar uma sessão de áudio.
- O service worker só existe no **build de produção**. No `npm run dev` ele fica desligado, de propósito, para não servir código velho enquanto você edita. Para testar: `npm run build` e depois `npm run preview:http`.

Observação: `npm audit` acusa 4 avisos "moderate" em `glob`/`minimatch`, dependências **de build** usadas só pelo gerador do service worker na sua máquina. Nada disso vai para o app publicado (`npm audit --omit=dev` = 0).

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
- **`src/audio/`** — Tudo que fala com a Web Audio API (o "motor de áudio" do navegador). O áudio é montado como um **grafo**: uma rede de nós ligados entre si, como um DAG de transformações num pipeline.
  - `engine.ts`: o motor do modo "Ouvir". Caminho: fonte → entrada mono → **A** (original) ou **B** (ConvolverNode com o IR, `normalize = false`) → crossfade A/B de 20 ms → volume → limiter (compressor rápido) → **hard clip em −1 dBFS** → mudo → saída.
    - O IR tocado é **o mesmo array** que vai para o WAV exportado. Trocar o IR usa dois convolvers alternados com crossfade, então não estala enquanto você arrasta uma banda.
    - "Compensar volume no A/B" mede o RMS dos dois caminhos e iguala o B ao A (±18 dB), para julgar só o timbre; não altera o arquivo.
    - Toda vez que o áudio liga, o volume volta a **−12 dB**. O botão de pânico (sempre visível, ou Esc) zera a saída na hora.
    - Fontes: entrada ao vivo (as mesmas configurações cruas do diagnóstico; escolhe canal ou par, e no Nano o padrão é **3+4**), gravação do usuário (WAV/MP3… em loop) ou loops de exemplo. A saída pode ir para outro dispositivo (`setSinkId`, Chrome/Edge).
  - `helpers.ts`: partes puras e testadas: curva do hard clip, compensação de volume, opções e padrão de canais.
  - `exampleLoops.ts` / `placeholderLoops.ts`: os loops reais vêm de `public/samples/<estilo>.wav`. Se não existirem e o app estiver em **desenvolvimento**, um placeholder sintético é gerado na hora (cordas Karplus-Strong + saturação + "caixa"). Em produção, sem os arquivos reais, a opção avisa que falta o loop.
  - `liveInput.ts`: abre a entrada com as configurações cruas (sem cancelamento de eco, supressão de ruído ou ganho automático, que destruiriam o timbre) e monta o grafo de medição do `/diagnostico`. `worklets/channel-probe.worklet.js` roda dentro da thread de áudio e conta os canais reais.
- **`src/dsp/`** — O "motor matemático". Só funções puras (entrada → saída, sem estado global, sem tela, sem áudio do navegador), como uma biblioteca Python de transformação que se testa com pytest sem subir nada. O lint proíbe esta pasta de importar React ou usar `window`/`document`. Conteúdo:
  - `biquad.ts`: fórmulas do _Audio EQ Cookbook_ (RBJ) que transformam "peak 3 kHz, -5 dB, Q 1,4" em 5 coeficientes. HPF/LPF de 24 dB/oitava = 2 biquads (Butterworth de 4ª ordem).
  - `cascade.ts`: aplica uma lista de biquads em sequência a um sinal (um pipeline de transformações).
  - `ir.ts`: gera o IR passando um impulso (1, 0, 0, …) pela cascata, corta no tamanho do aparelho e aplica um fade (meia janela de Hann) nas últimas 64 amostras para o final chegar a 0 sem "degrau".
  - `fft.ts` / `response.ts`: FFT própria e as duas curvas do gráfico, a **alvo** (calculada pelas fórmulas) e a **real** (medida no IR truncado).
  - `deviation.ts`: compara alvo × real e aponta as regiões com mais de 1 dB de diferença.
  - `convolve.ts`: convolução (direta para IRs curtos, via FFT para sinais longos). Vai servir para juntar IR de caixa + EQ.
  - `resample.ts`: muda a taxa de amostragem (ex.: IR de caixa de 44,1 kHz → 48 kHz) com sinc janelado (Kaiser). `resampleIr` corrige o ganho e preserva as "pontas" do filtro para a curva não mudar.
  - `target.ts`: ponto de extensão da v2 ("curva desenhada → IR"), por enquanto só tipos.
  - `modes/`: os **modos de EQ** como "compiladores" puros. Cada modo (gráfico, tone stack, tilt) recebe os controles da tela e devolve a mesma lista de filtros do modo paramétrico, como vários front-ends de SQL gerando o mesmo plano de execução. Por isso exportação, gráfico e áudio não sabem (nem precisam saber) em que modo você está.
    - `config.ts`: frequências e faixas, fáceis de editar. **Graphic-9 = as mesmas frequências do bloco Graphic-9 do Nano Cortex** (65, 125, 250, 500 Hz, 1, 2, 4, 8, 16 kHz), conferidas no app do aparelho. 10 bandas = oitavas ISO; 31 bandas = 1/3 de oitava ISO.
    - `compilers.ts`: no modo gráfico cada slider é um peak com **Q proporcional** (`Q = Q_base × (0,7 + |ganho|/12)`): com pouco ganho a banda é larga e suave; com muito ganho, estreita, para vazar menos nas vizinhas. A fórmula foi escolhida por protótipo numérico. Em seguida, 3 iterações de correção ajustam os ganhos internos para a curva no centro de cada banda **bater com o valor do slider** (±0,5 dB). Tone stack = grave (low shelf 120 Hz), médio (peak com frequência selecionável), agudo (high shelf 2,5 kHz) e presença (peak 4,5 kHz). Tilt = low shelf −t + high shelf +t no mesmo pivô.
    - **Conversões:** qualquer modo → paramétrico é **sem perda** (as bandas compiladas viram bandas editáveis). Paramétrico → gráfico é **aproximação**: os sliders recebem o valor da curva no centro de cada banda, e o app avisa antes. Tone stack/tilt não conseguem imitar uma curva qualquer, então ao entrar neles a curva atual é substituída (também com aviso). Tudo pode ser desfeito.
    - Limitação honesta: não temos como saber o Q interno que a Neural DSP usa no Graphic-9. Os mesmos valores nos sliders dão uma curva parecida, mas não necessariamente idêntica. Compare de ouvido (A/B) no aparelho.
- **`src/model/`** — O "schema" da fonte da verdade: o tipo `CurveConfig` (modo, bandas, ganho de saída, aparelho, controles de cada modo em `modeState`) com `schemaVersion`. `modes.ts` liga o modelo aos compiladores de modo; ao abrir um preset fora do modo paramétrico, as bandas são recompiladas a partir dos controles, para arquivo e tela nunca divergirem. Fica numa camada própria, abaixo de `state/` e `io/`, porque os dois dependem dele, como um contrato de dados compartilhado entre o job que escreve e o que lê.
- **`src/io/`** — Entrada e saída de arquivos e do banco local:
  - `wavEncode.ts` / `wavDecode.ts`: escrevem e leem WAV. A exportação usa 24-bit PCM por padrão e **troca sozinha para 32-bit float** quando o pico passa de 1.0, porque PCM inteiro cortaria (clip) o sinal. A leitura aceita 8/16/24/32-bit, float e o formato "extensible", e ignora chunks extras (metadados), como fazem os players.
  - `presetsJson.ts`: salvar e abrir presets `.json`. Ao ler, aplica **migrações** de versões antigas do schema (v1 → v2 → …), igual a _schema evolution_ num data lake, e depois **valida**: tipos desconhecidos são recusados e valores fora da faixa são ajustados com aviso. Preset de versão mais nova que o app é recusado.
  - `presetsDb.ts`: guarda presets no **IndexedDB**, o banco embutido do navegador, que fica no aparelho e nunca vai para servidor. Ao carregar, passa pela mesma migração/validação.
  - `fileName.ts`: nome automático do WAV, ex.: `EQ_3k-5dB_+9dB_Nano1024.wav` (as 3 bandas de maior impacto, o ganho de saída e o aparelho com o tamanho).
  - `files.ts`: download de arquivo gerado no navegador e leitura de arquivo escolhido pelo usuário.
- **`src/workers/`** — Cálculo pesado fora da thread da tela. Um **Web Worker** é uma segunda thread do navegador: a interface manda a curva (JSON) e recebe o IR pronto, sem travar animações nem arrastos. Analogia: a UI é o driver e o worker é um executor de jobs.
  - `irEngine.ts`: função pura `computeIr(curva, caixa?)` → IR final, curva alvo, curva real, desvios por banda (marca "imprecisa" acima de 3 dB) e formato de exportação. Roda igual no worker, nos testes e no `make-test-irs`. **Com caixa:** a caixa é cortada no trecho necessário, convertida para a taxa do aparelho (resample), passada pela mesma cascata de biquads do EQ (o que equivale a convoluir caixa × EQ), recebe o ganho de saída e é cortada com fade no tamanho do aparelho. Saem três curvas: caixa sozinha (como o aparelho a tocaria), EQ sozinho e caixa + EQ. As curvas com caixa são suavizadas em 1/12 de oitava, porque o espectro de uma caixa tem muitos picos e vales estreitos que o ouvido não separa e que encheriam a tela de falsos avisos.
  - `dsp.worker.ts`: o worker em si, só uma casca em volta do `computeIr`. Os arrays voltam "transferidos" (movidos sem cópia).
  - `dspClient.ts`: no máximo **um cálculo a cada ~30 ms, sempre com o estado mais recente**. Durante um arrasto o gráfico atualiza ~30×/s; respostas atrasadas de pedidos antigos são descartadas ("último vence"). Um _debounce_ puro foi descartado porque, com o dedo arrastando sem parar, ele só calcularia ao soltar.
- **`src/state/`** — Estado global com **Zustand** (um "store": um objeto observável que os componentes leem e assinam).
  - `curveStore.ts`: a **fonte da verdade**, a `CurveConfig`. Todo o resto é derivado dela, como uma view materializada recalculada a partir da tabela base. Tem desfazer/refazer: um arrasto inteiro (`beginGesture` → várias atualizações → `endGesture`) vira **uma** entrada no histórico. A curva atual fica salva no `localStorage`, então recarregar a página não perde o trabalho; ao recarregar, ela passa pela mesma validação dos presets.
  - `history.ts`: desfazer/refazer como funções puras (lista `past`/`future`, limite de 100), como _time travel_ de uma tabela Delta.
  - `cabStore.ts`: o IR de caixa importado. Fica **fora** da curva e do desfazer, porque é um arquivo de áudio e não um ajuste. Aceita qualquer sample rate; se for estéreo, usa o canal L por padrão, com opção de média L+R. Arquivos acima de 2 s são cortados. A caixa fica salva no IndexedDB (`io/cabDb.ts`) e volta sozinha ao recarregar a página, mas não entra nos presets `.json`.
  - `irStore.ts`: guarda o último resultado do worker (cache derivado) e liga curva → worker → resultado (`startIrSync`, chamado no `main.tsx`). `flushIr()` força o cálculo imediato, por exemplo antes de exportar.
- **`tests/`** — Testes Vitest espelhando `src/`. `tests/integration/` simula o modeler: convolui ruído branco com o IR e mede, só pela entrada e saída, se a curva aplicada é a esperada.
- **`src/ui/`** — Componentes React: só desenham a tela e repassam cliques. Nenhuma conta de DSP mora aqui.
  - `editor/EqGraph.tsx`: o gráfico em SVG (desenho vetorial). Mouse, dedo e caneta passam pelo mesmo caminho (**Pointer Events**). Arrastar um ponto muda frequência (x) e ganho (y); a roda do mouse sobre um ponto, ou a pinça com dois dedos, muda o Q; duplo clique cria uma banda. O arrasto inteiro vira **uma** entrada no desfazer. Faixas amarelas marcam onde a curva real se afasta mais de 1 dB da pedida, e um anel tracejado marca bandas "imprecisas neste aparelho" (acima de 3 dB).
  - `editor/scale.ts`: conversões Hz/dB ↔ pixels (eixo X logarítmico), puras e testadas.
  - `editor/BandPanel.tsx`, `Toolbar.tsx`, `DevicePicker.tsx`, `DeviationNotice.tsx`: lista e controles das bandas, desfazer/refazer (também Ctrl+Z / Ctrl+Shift+Z), escolha do aparelho e aviso de desvio com a explicação do tamanho do IR.
  - `export/OutputPanel.tsx`: ganho de saída, medidor de pico do IR, formato (24-bit ou float, com troca forçada acima de 0 dBFS) e o botão de exportar. Na hora de exportar, o IR é recalculado com a mesma função pura do worker, então o arquivo é idêntico ao que o gráfico mostra.
  - `presets/PresetsPanel.tsx`: salvar/abrir/apagar presets no navegador e exportar/importar `.json`.
  - `cab/CabPanel.tsx`: importar o WAV da caixa, escolher L ou média se for estéreo, ligar/desligar a caixa e ver avisos de conversão de taxa e de corte. Com caixa ativa, o gráfico mostra caixa, EQ e o combinado, e o arquivo exportado se chama `CAB+EQ_<caixa>_<ajustes>_<aparelho>.wav`.

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
