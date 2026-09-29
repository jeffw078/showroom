# Pellens Showroom

Execute `python -m http.server 8000` nesta pasta e abra http://localhost:8000 em computador, tablet ou celular. O 3D usa módulos JavaScript e precisa de HTTP/HTTPS. Os botões “Acessar sistema” abrem https://www.pellens.com.br/sistema. O endereço está definido em `SYSTEM_URL` em `app.js` e nos links de `index.html`. O projeto pode ser publicado como site estático no Vercel; não precisa de etapa de build.

## Desempenho

As 13 fotografias originais somam **118,66 MB**, com até 8.367 pixels de largura. Uma foto desse tamanho pode ocupar cerca de 200 MB na decodificação, além das texturas da GPU. As miniaturas usavam as mesmas fotos completas; o pré-carregamento também competia com a primeira foto. Esse volume explica um gargalo importante de download, decodificação e memória. O servidor de produção não foi medido.

As fotos principais agora usam WebP de 1280 ou 1920 pixels, escolhidas pelo navegador. As 13 versões de 1920 pixels somam **3,69 MB**, uma redução de **96,89%**. Todas as miniaturas de 320 pixels somam **98 KB**. Os originais foram preservados e o site usa as versões otimizadas.

Os detalhes internos são carregados apenas no modal. O pré-carregamento dos vizinhos começa depois da primeira foto e respeita economia de dados, conexão lenta, aba oculta e modo 3D. O layout agora permite usar fotos e configurador também em celular.

A espera indefinida por uma imagem que já havia falhado foi corrigida. O autoplay aguarda a transição terminar antes de contar os próximos cinco segundos. O arraste do carrossel agora captura o ponteiro somente após um movimento, preservando os cliques nas miniaturas. O HTML do logotipo foi corrigido e os detalhes técnicos existentes foram cadastrados.

## Adicionar fotografias

1. Coloque o original em `assets/products` e cadastre `file` no produto em `app.js`.
2. Para detalhes, coloque o original em `assets/products/details` e cadastre `detailFile`.
3. Execute `python scripts/optimize-images.py`. Requer Pillow: `python -m pip install Pillow`.
4. Publique também `assets/products/optimized`, `thumbs` e `details/optimized`. Os originais não são necessários para executar o site.

## Configurador 3D

Os botões **FOTOS** e **3D** ficam no topo. FOTOS mostra a coleção de fotografias. Em 3D, as categorias **Base**, **Colchão** e **Cabeceira** aparecem acima do seletor inferior. Cada categoria possui três opções e a seleção de uma peça mantém as outras duas. As miniaturas usam temporariamente as fotografias existentes.

Os nove modelos reais são carregados destas pastas:

- `assets/models/bases/base_01.glb` até `base_03.glb`.
- `assets/models/colchoes/colchao_01.glb` até `colchao_03.glb`.
- `assets/models/cabeceiras/cabeceira_01.glb` até `cabeceira_03.glb`.

O catálogo `COMPONENTS` em `app.js` mantém os nomes, arquivos e seleções independentes. `showroom-scene.js` usa `GLTFLoader` para carregar cada GLB separadamente. Apenas a peça selecionada é substituída; as demais, o quarto, as luzes, a câmera e o renderer permanecem os mesmos. Todos os nove GLBs são mantidos em cache após o primeiro carregamento.

Nenhum GLB é recentralizado. Os vértices, as origens e os eixos X/Z permanecem intactos. A compensação vertical de apoio do colchão que já existia no configurador foi preservada, com o mesmo resultado nas 27 combinações. `model-composer.js` permanece como referência para os testes compararem o posicionamento anterior; não é carregado pelo site.

### Quarto, materiais e cores

Em `showroom-scene.js`, `createRoom()` reúne `createFloor()` e `createWalls()`. O piso é um plano de 10 × 10 metros em Y = -1,705, abaixo da cama. A parede traseira tem 8 × 4 metros e fica em Z = -3,22, atrás de todas as cabeceiras. Há uma parede esquerda e rodapés discretos. O quarto é criado uma única vez pelo construtor de `ShowroomScene`.

`createLighting()` usa AmbientLight, DirectionalLight principal com sombra e HemisphereLight de preenchimento. O renderer usa PCFSoftShadowMap, sombras de 1024 pixels, cores sRGB e ACESFilmicToneMapping com exposição 0,85. Não há HDR, pós-processamento, texturas externas ou decoração complexa.

`MATERIAL_SETTINGS` define os materiais MeshStandardMaterial da base, colchão e cabeceira. `applyMaterialToComponent()` percorre os meshes, aplica o material correspondente e habilita castShadow/receiveShadow. Os materiais usam metalness 0 e roughness 0,9 para tecidos / 0,95 para colchão. As cores iniciais são bege quente, branco quente e taupe. Os GLBs atuais têm formas simples; os materiais não adicionam costuras ou detalhes inexistentes na geometria.

`setBaseColor(color)` e `setHeadboardColor(color)` alteram apenas a cor do material, sem baixar ou trocar GLBs. As amostras da interface são geradas automaticamente a partir de `FABRIC_COLORS`, no início de `showroom-scene.js`. Para adicionar uma nova cor, acrescente, por exemplo, `verde: '#7b8270'` nesse objeto. As escolhas de cor continuam aplicadas ao trocar as peças ou alternar FOTOS / 3D.

### Câmera

“30% de giro” foi interpretado como **108° no total**, ou **54° para cada lado**. O ângulo vertical permanece fixo em 75°, sem deslocamento lateral ou vertical e sem recentralização por clique. O alvo da câmera permanece no centro do conjunto. O limite mínimo de distância usa 135% do raio da esfera que contém todas as peças, mantendo a câmera fora da geometria. Os botões e a roda do mouse respeitam os mesmos limites.

O botão de restaurar retorna ao enquadramento inicial. Para ajustar o giro e a elevação fixa, altere `CAMERA` em `app.js`.

Three.js 0.180.0, OrbitControls e GLTFLoader são distribuídos localmente em `assets/vendor/three/` e só são carregados após clicar em 3D. O import map em `index.html` resolve esses módulos, sem CDN durante a execução. O autoplay fica pausado no modo 3D. FOTOS restaura a fotografia anterior e pausa o renderer. O quarto é reutilizado ao retornar ao 3D. Falhas exibem uma mensagem e permitem tentar novamente selecionando a peça.

OrbitControls usa damping e dispara renderização apenas enquanto há mudanças; não existe loop contínuo quando a cena está estável. A resolução é limitada a DPR 2 em desktop e 1,5 em celular. ResizeObserver e o evento resize atualizam tamanho do canvas, aspecto da câmera e projeção. O limite vertical e o giro de 30% anteriores foram mantidos. A câmera é limitada à região frontal, sem pan e sem atravessar a cama.

O peso dos futuros modelos também influencia o tempo de abertura; mantenha os arquivos adequados às conexões do público.

### Transição entre peças

As trocas usam uma dissolução de 320 ms: a peça atual desaparece em 140 ms e a nova aparece em 180 ms, com aceleração suave. `COMPONENT_TRANSITION`, em `showroom-scene.js`, define os tempos. Nenhum modelo é deslocado ou recentralizado pela animação. Quando uma base muda a altura de apoio do colchão, o colchão também participa da dissolução para ocultar o ajuste de encaixe já existente.

A última escolha prevalece em cliques rápidos; a transição anterior é cancelada e os materiais recuperam sua opacidade. FOTOS também cancela a animação. A primeira montagem, escolhas idênticas e navegadores com movimento reduzido não animam. A animação termina ao ocultar a aba e o renderer volta ao repouso após a troca. Não foram adicionadas bibliotecas ou texturas.

[Documentação do Three.js](https://threejs.org/docs/). A licença MIT está em `assets/vendor/three/LICENSE.txt`. A biblioteca model-viewer anterior foi preservada nos arquivos, mas não é utilizada na execução atual.

## Verificação

```sh
node --check app.js
node --check showroom-scene.js
python scripts/verify-showroom.py
```

A verificação requer Playwright (`python -m pip install playwright`) e Google Chrome instalado. `scripts/verify-room.py` abre um servidor temporário e verifica fotos, detalhes, recuperação após falhas, os nove GLBs, as 27 combinações contra o posicionamento anterior, troca modular sem duplicação do cenário, cores sem downloads, câmera, limites do zoom, ausência de loop de renderização em repouso e responsividade. Gera prévias para desktop, celular, tablet e landscape. As fontes externas são bloqueadas apenas durante o teste. Os testes usam Chrome com WebGL em software; desempenho em dispositivos reais e hospedagem Vercel não foi medido.
