# GhostEQ — O EQ que não ocupa slot

*The EQ that takes no slot.*

GhostEQ gera arquivos WAV de **impulse response (IR)** que contêm uma curva de EQ. Você carrega esse WAV no bloco de IR do seu modeler (Nano Cortex, Quad Cortex, Helix…) e ganha um EQ sem gastar um slot de efeito. Tudo roda no seu navegador: nenhum áudio sai do seu computador.

> **Status:** etapa 0 (diagnóstico de entrada ao vivo). O editor de EQ vem nas próximas etapas.

---

## Rodando localmente

Pré-requisito: Node.js 20+ (testado com Node 24). Dentro da pasta `ghosteq/`:

| Comando | O que faz | O que esperar |
|---|---|---|
| `npm install` | Baixa as dependências para `node_modules/` (como um `pip install -r requirements.txt`). | Termina com "found 0 vulnerabilities" ou parecido. Só precisa rodar de novo quando o `package.json` mudar. |
| `npm run dev` | Sobe o servidor de desenvolvimento com recarga automática. | Mostra `Local: https://localhost:5173/` e `Network: https://192.168.x.x:5173/`. Fica rodando até `Ctrl+C`. |
| `npm run dev:http` | Mesmo servidor, mas em HTTP puro em `http://localhost:5174`, só no próprio PC. | Útil se o aviso de certificado atrapalhar. Não funciona no celular (fora de localhost o navegador bloqueia o áudio sem HTTPS). |
| `npm run typecheck` | Checa os tipos do TypeScript (como um mypy rigoroso). | Sem saída = tudo certo. |
| `npm run build` | Typecheck + gera a versão de produção em `dist/`. | Lista os arquivos gerados e "built in …ms". |
| `npm run preview` | Serve a pasta `dist/` como em produção. | URL em `https://localhost:4173/`. |

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
- **`src/ui/`** — Componentes React: só desenham a tela e repassam cliques. Nenhuma conta de DSP mora aqui.

*(As camadas `dsp/`, `io/`, `state/` e `workers/` serão documentadas aqui conforme forem criadas.)*

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
