# Pellens Showroom

Site estático com fotos e configurador 3D em Three.js. Execute `python -m http.server 8000` nesta pasta e abra `http://localhost:8000`. HTTP/HTTPS é necessário para carregar os módulos JavaScript e GLBs. Os botões **Acessar sistema** apontam para `https://www.pellens.com.br/sistema`.

## Catálogo 3D

O catálogo estruturado está em [`catalogo.js`](catalogo.js). Todos os caminhos são relativos a `assets/models/`, com os nomes exatos do pacote, inclusive espaços e acentos. Há três ambientes e 12 conjuntos completos. **SÉRIE ESPECIAL** continua na coleção de fotos, mas fica desabilitado no seletor 3D porque seus GLBs não foram fornecidos.

Em **3D**, escolha um ambiente, um conjunto completo ou misture **Base**, **Colchão** e **Cabeceira** entre os 12 conjuntos. Selecionar outro conjunto completo substitui as três peças. As opções de peça ficam na faixa inferior; a seleção de cada uma preserva as outras duas. O ambiente atual é o único ambiente carregado na cena. O renderer, a câmera e a iluminação são reutilizados durante as trocas. As peças são buscadas individualmente e ficam em cache depois do primeiro uso.

[`showroom-scene.js`](showroom-scene.js) usa `GLTFLoader` e mantém os materiais PBR dos GLBs: mapas de cor, normal, rugosidade e outras propriedades não são trocados por material chapado. As amostras de cor da base e da cabeceira são **opcionais**. Clicar em uma cor cria uma cópia do material PBR e muda apenas sua cor; **Original** recupera o material do arquivo. `FABRIC_COLORS` define as amostras disponíveis.

Os GLBs do pacote usam **Z como eixo vertical**; o grupo da cena é girado uma vez para a convenção Y do Three.js. Os pivots, vértices e coordenadas de cada arquivo permanecem intactos. Apenas o colchão recebe uma pequena compensação no eixo Z do pacote, calculada pela caixa da base selecionada, para apoiar corretamente combinações de conjuntos diferentes. A cabeceira mantém a posição original compartilhada pelos arquivos.

A troca de peça usa uma dissolução de 140 ms na saída e 180 ms na entrada, sem mover o modelo. A animação respeita `prefers-reduced-motion`; cliques rápidos cancelam a escolha anterior. A câmera mantém giro horizontal limitado a ±54°, altura fixa, zoom limitado e pan desativado. O canvas responde ao redimensionamento e deixa de renderizar quando está em repouso ou quando o usuário volta para **FOTOS**.

## Imagens e desempenho

As 13 fotografias originais somam 118,66 MB. O site usa versões WebP de 1280/1920 pixels e miniaturas de 320 pixels; as versões principais de 1920 pixels somam 3,69 MB. Os originais foram preservados. Para otimizar novas fotos, instale Pillow (`python -m pip install Pillow`) e execute `python scripts/optimize-images.py`.

Three.js 0.180.0, OrbitControls e GLTFLoader são distribuídos localmente em `assets/vendor/three/` e carregados apenas ao abrir o 3D. A licença está em `assets/vendor/three/LICENSE.txt`. O projeto pode ser publicado como site estático no Vercel, sem build.

## Verificação

```sh
node --check app.js
node --check catalogo.js
node --check showroom-scene.js
python scripts/verify-package.py
```

O teste de navegador requer Playwright (`python -m pip install playwright`) e Google Chrome. Ele verifica 12 conjuntos, três ambientes, mistura de peças, materiais PBR, cores opcionais e o modo FOTOS. A prévia 3D gerada fica em `showroom-3d-preview.png`.
