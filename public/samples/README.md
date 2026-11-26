# Loops de exemplo

Os loops servem para ouvir o EQ quando não há modeler ligado. Como o bloco de IR fica **depois do amp** na cadeia, os loops precisam ser **sinal já amplificado** (amp + caixa), nunca DI crua.

## Loops reais (a gravar)

Três arquivos, gravados pela saída **USB 3/4 do Nano Cortex** com:

- bloco de IR em **flat** (ou desligado) e efeitos pós (delay/reverb/mod) **desligados**;
- um estilo por arquivo: `clean.wav`, `crunch.wav`, `highgain.wav`.

Formato esperado:

| Item        | Valor                                                       |
| ----------- | ----------------------------------------------------------- |
| Container   | WAV (PCM 16/24-bit ou 32-bit float)                         |
| Sample rate | 48 kHz                                                      |
| Canais      | mono ou estéreo (estéreo é somado para mono no preview)     |
| Duração     | 10–20 s, de preferência com começo e fim que emendem (loop) |
| Nível       | normalizado a pico de **-1 dBFS**                           |

Coloque os arquivos nesta pasta com exatamente esses nomes; o app os encontra automaticamente.

## Placeholders de desenvolvimento

Enquanto os loops reais não existem, o projeto pode gerar loops **sintéticos** (corda simulada + saturação + filtro de caixa) só para desenvolvimento. Eles não representam o timbre de um amp real e não devem ir para produção. O script será adicionado na etapa do motor de áudio.
