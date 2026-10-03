// Caminhos relativos a assets/models/. Nomes de pasta e arquivo seguem o pacote original.
export const catalogo = {
  ambientes: [
    'ambientes/ambiente_01_luz_natural.glb',
    'ambientes/ambiente_02_hotel_contemporaneo.glb',
    'ambientes/ambiente_03_conforto_madeira.glb'
  ],
  conjuntos: Object.fromEntries([
    'ADHARA', 'AMORE', 'ASTO', 'AUSTIN', 'ELON', 'FLORENCE', 'MADRI',
    'PREMIUM HIBRYD', 'RAVENA', 'SLEPP WELL', 'SUAVITTA', 'VENEZA'
  ].map(name => [name, {
    cabeceira: `${name}/${name}_cabeceira.glb`,
    colchao: `${name}/${name}_colchao.glb`,
    base: `${name}/${name}_base.glb`
  }]))
};

export const AMBIENTE_NOMES = [
  'Luz natural', 'Hotel contemporâneo', 'Conforto e madeira'
];

export const MODELS_ROOT = 'assets/models/';
export const modelURL = path => new URL(MODELS_ROOT + path.split('/').map(encodeURIComponent).join('/'), document.baseURI).href;
