/**
 * popular_completo.js
 * 
 * Popula TODAS as categorias com:
 * - 5+ marcas por produto
 * - 5+ produtos por categoria
 * - Preços variados em mercados diferentes
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'geofertas-325b0'
});

const db = admin.firestore();

// ── Produtos por categoria ────────────────────────────────────
const PRODUTOS = {

  mercearia: [
    { nome: 'Arroz Tio João 5kg',        sin: ['arroz','tio joao','tio joão'],         preco: 24.90 },
    { nome: 'Arroz Camil 5kg',            sin: ['arroz','camil'],                        preco: 22.90 },
    { nome: 'Arroz Prato Fino 5kg',       sin: ['arroz','prato fino'],                   preco: 19.90 },
    { nome: 'Arroz Namorado 5kg',         sin: ['arroz','namorado'],                     preco: 18.90 },
    { nome: 'Arroz Tio Urbano 5kg',       sin: ['arroz','tio urbano'],                   preco: 17.90 },
    { nome: 'Feijão Carioca Camil 1kg',   sin: ['feijao','feijão','camil feijao'],       preco: 8.90  },
    { nome: 'Feijão Carioca Kicaldo 1kg', sin: ['feijao','feijão','kicaldo'],            preco: 9.50  },
    { nome: 'Feijão Preto Camil 1kg',     sin: ['feijao preto','feijão preto'],          preco: 9.90  },
    { nome: 'Feijão Carioca Tio João 1kg',sin: ['feijao','tio joao feijao'],            preco: 8.50  },
    { nome: 'Feijão Carioca Prato Fino 1kg',sin:['feijao','prato fino feijao'],         preco: 7.90  },
    { nome: 'Macarrão Espaguete Barilla 500g', sin:['macarrao','macarrão','barilla'],   preco: 5.90  },
    { nome: 'Macarrão Espaguete Adria 500g',   sin:['macarrao','macarrão','adria'],     preco: 4.50  },
    { nome: 'Macarrão Parafuso Renata 500g',   sin:['macarrao','macarrão','renata'],    preco: 3.90  },
    { nome: 'Macarrão Penne Barilla 500g',     sin:['macarrao','macarrão','penne'],     preco: 6.20  },
    { nome: 'Macarrão Espaguete Nissin 500g',  sin:['macarrao','macarrão','nissin'],    preco: 3.50  },
    { nome: 'Óleo de Soja Liza 900ml',    sin: ['oleo','óleo','liza'],                  preco: 7.90  },
    { nome: 'Óleo de Soja Soya 900ml',    sin: ['oleo','óleo','soya'],                  preco: 7.50  },
    { nome: 'Óleo de Soja Salada 900ml',  sin: ['oleo','óleo','salada'],                preco: 6.90  },
    { nome: 'Óleo de Soja Vila Verde 900ml',sin:['oleo','óleo','vila verde'],           preco: 6.50  },
    { nome: 'Óleo de Soja Cocinero 900ml',sin: ['oleo','óleo','cocinero'],              preco: 8.20  },
    { nome: 'Açúcar União 1kg',           sin: ['acucar','açúcar','uniao','união'],      preco: 4.90  },
    { nome: 'Açúcar Guarani 1kg',         sin: ['acucar','açúcar','guarani'],            preco: 4.50  },
    { nome: 'Açúcar Cristal Caravelas 1kg',sin:['acucar','açúcar','caravelas'],         preco: 4.20  },
    { nome: 'Açúcar Refinado União 1kg',  sin: ['acucar refinado','açúcar refinado'],   preco: 5.20  },
    { nome: 'Açúcar Demerara Native 1kg', sin: ['acucar demerara','açúcar demerara'],   preco: 8.90  },
    { nome: 'Farinha de Trigo Dona Benta 1kg', sin:['farinha','dona benta'],            preco: 5.90  },
    { nome: 'Farinha de Trigo Anaconda 1kg',   sin:['farinha','anaconda'],              preco: 4.90  },
    { nome: 'Farinha de Trigo Mirabel 1kg',    sin:['farinha','mirabel'],               preco: 4.50  },
    { nome: 'Sal Marinho Cisne 1kg',      sin: ['sal','cisne'],                          preco: 2.90  },
    { nome: 'Sal Refinado Lebre 1kg',     sin: ['sal','lebre'],                          preco: 2.50  },
  ],

  bebidas: [
    { nome: 'Coca-Cola 2L',              sin: ['coca','coca-cola','refrigerante'],       preco: 9.90  },
    { nome: 'Pepsi 2L',                  sin: ['pepsi','refrigerante'],                  preco: 8.90  },
    { nome: 'Guaraná Antarctica 2L',     sin: ['guarana','guaraná','antarctica'],        preco: 8.50  },
    { nome: 'Sprite 2L',                 sin: ['sprite','refrigerante'],                 preco: 8.90  },
    { nome: 'Fanta Laranja 2L',          sin: ['fanta','refrigerante'],                  preco: 8.90  },
    { nome: 'Água Mineral Crystal 1,5L', sin: ['agua','água','crystal agua'],            preco: 2.99  },
    { nome: 'Água Mineral Bonafont 1,5L',sin: ['agua','água','bonafont'],               preco: 2.79  },
    { nome: 'Água Mineral Indaiá 1,5L',  sin: ['agua','água','indaia','indaiá'],        preco: 2.59  },
    { nome: 'Água Mineral Minalba 1,5L', sin: ['agua','água','minalba'],                preco: 3.20  },
    { nome: 'Água Mineral São Lourenço 1,5L',sin:['agua','água','sao lourenco'],        preco: 3.50  },
    { nome: 'Suco Del Valle Uva 1L',     sin: ['suco','del valle','suco uva'],           preco: 8.90  },
    { nome: 'Suco Sufresh Laranja 1L',   sin: ['suco','sufresh','suco laranja'],         preco: 6.90  },
    { nome: 'Suco Ades Laranja 1L',      sin: ['suco','ades'],                           preco: 7.50  },
    { nome: 'Energético Monster 473ml',  sin: ['energetico','energético','monster'],     preco: 9.99  },
    { nome: 'Energético Red Bull 250ml', sin: ['energetico','energético','red bull'],    preco: 12.90 },
  ],

  laticinios: [
    { nome: 'Leite Integral Piracanjuba 1L',sin:['leite','piracanjuba'],                preco: 5.90  },
    { nome: 'Leite Integral Italac 1L',  sin: ['leite','italac'],                        preco: 5.50  },
    { nome: 'Leite Integral Parmalat 1L',sin: ['leite','parmalat'],                      preco: 5.70  },
    { nome: 'Leite Integral Ninho 1L',   sin: ['leite','ninho'],                         preco: 6.90  },
    { nome: 'Leite Integral Betânia 1L', sin: ['leite','betania','betânia'],             preco: 5.40  },
    { nome: 'Iogurte Natural Danone 170g',sin:['iogurte','danone'],                     preco: 3.50  },
    { nome: 'Iogurte Natural Vigor 170g',sin: ['iogurte','vigor'],                       preco: 3.20  },
    { nome: 'Iogurte Grego Danone 90g',  sin: ['iogurte grego','iogurte','danone grego'],preco: 4.90 },
    { nome: 'Iogurte Corpus Piracanjuba 170g',sin:['iogurte','corpus'],                 preco: 3.90  },
    { nome: 'Iogurte Natural Nestlé 170g',sin:['iogurte','nestle','nestlé'],            preco: 3.40  },
    { nome: 'Manteiga Aviação 200g',     sin: ['manteiga','aviacao','aviação'],          preco: 8.90  },
    { nome: 'Manteiga Qualy 200g',       sin: ['manteiga','qualy'],                      preco: 8.50  },
    { nome: 'Manteiga Italac 200g',      sin: ['manteiga','italac manteiga'],            preco: 7.90  },
    { nome: 'Queijo Mussarela Forno de Minas 300g',sin:['queijo','mussarela','forno de minas'],preco:18.90},
    { nome: 'Queijo Prato Tirolez 300g', sin: ['queijo prato','tirolez'],                preco: 16.90 },
  ],

  acougue: [
    { nome: 'Frango Inteiro Sadia kg',   sin: ['frango','sadia frango'],                 preco: 12.90 },
    { nome: 'Frango Inteiro Seara kg',   sin: ['frango','seara frango'],                 preco: 11.90 },
    { nome: 'Frango Inteiro Perdigão kg',sin: ['frango','perdigao frango'],              preco: 12.50 },
    { nome: 'Peito de Frango Sadia kg',  sin: ['peito de frango','frango peito'],        preco: 22.90 },
    { nome: 'Coxa de Frango Seara kg',   sin: ['coxa de frango','frango coxa'],          preco: 14.90 },
    { nome: 'Carne Moída Patinho kg',    sin: ['carne moida','carne moída','patinho'],   preco: 34.90 },
    { nome: 'Alcatra Bovina kg',         sin: ['alcatra','carne'],                        preco: 44.90 },
    { nome: 'Picanha Bovina kg',         sin: ['picanha','carne'],                        preco: 79.90 },
    { nome: 'Linguiça Toscana Sadia kg', sin: ['linguica','linguiça','sadia linguica'],  preco: 19.90 },
    { nome: 'Costela Suína kg',          sin: ['costela','costelinha'],                  preco: 24.90 },
  ],

  hortifruti: [
    { nome: 'Banana Prata kg',           sin: ['banana','banana prata'],                 preco: 4.90  },
    { nome: 'Maçã Fuji kg',              sin: ['maca','maçã'],                           preco: 8.90  },
    { nome: 'Tomate kg',                 sin: ['tomate'],                                 preco: 6.90  },
    { nome: 'Cebola kg',                 sin: ['cebola'],                                 preco: 4.50  },
    { nome: 'Batata kg',                 sin: ['batata'],                                 preco: 5.90  },
    { nome: 'Alface un',                 sin: ['alface'],                                 preco: 2.90  },
    { nome: 'Laranja Pera kg',           sin: ['laranja'],                                preco: 3.90  },
    { nome: 'Mamão Formosa kg',          sin: ['mamao','mamão'],                         preco: 5.90  },
    { nome: 'Cenoura kg',                sin: ['cenoura'],                                preco: 4.90  },
    { nome: 'Limão kg',                  sin: ['limao','limão'],                         preco: 7.90  },
  ],

  higiene_pessoal: [
    { nome: 'Sabonete Dove 90g',         sin: ['sabonete','dove'],                        preco: 3.90  },
    { nome: 'Sabonete Lux 90g',          sin: ['sabonete','lux'],                         preco: 2.90  },
    { nome: 'Sabonete Palmolive 90g',    sin: ['sabonete','palmolive'],                   preco: 3.20  },
    { nome: 'Sabonete Protex 90g',       sin: ['sabonete','protex'],                      preco: 3.50  },
    { nome: 'Sabonete Nivea 90g',        sin: ['sabonete','nivea','nívea'],              preco: 4.20  },
    { nome: 'Shampoo Pantene 400ml',     sin: ['shampoo','xampu','pantene'],              preco: 14.90 },
    { nome: 'Shampoo Seda 325ml',        sin: ['shampoo','xampu','seda'],                 preco: 11.90 },
    { nome: 'Shampoo TRESemmé 400ml',    sin: ['shampoo','xampu','tresemme'],             preco: 16.90 },
    { nome: 'Shampoo Elseve 400ml',      sin: ['shampoo','xampu','elseve'],               preco: 15.90 },
    { nome: 'Shampoo Head Shoulders 400ml',sin:['shampoo','head shoulders'],             preco: 17.90 },
    { nome: 'Creme Dental Colgate 90g',  sin: ['creme dental','pasta de dente','colgate'],preco: 3.90 },
    { nome: 'Creme Dental Oral-B 70g',   sin: ['creme dental','pasta de dente','oral-b'],preco: 4.50 },
    { nome: 'Creme Dental Sorriso 90g',  sin: ['creme dental','pasta de dente','sorriso'],preco: 2.90},
    { nome: 'Creme Dental Close-Up 90g', sin: ['creme dental','pasta de dente','close-up'],preco:3.50},
    { nome: 'Desodorante Rexona 150ml',  sin: ['desodorante','rexona'],                   preco: 12.90 },
  ],

  limpeza: [
    { nome: 'Detergente Ypê 500ml',      sin: ['detergente','ype','ypê'],                preco: 2.50  },
    { nome: 'Detergente Limpol 500ml',   sin: ['detergente','limpol'],                   preco: 2.20  },
    { nome: 'Detergente Fairy 500ml',    sin: ['detergente','fairy'],                     preco: 4.90  },
    { nome: 'Detergente Ajax 500ml',     sin: ['detergente','ajax'],                      preco: 2.90  },
    { nome: 'Detergente Mon Bijou 500ml',sin: ['detergente','mon bijou'],                 preco: 2.10  },
    { nome: 'Sabão em Pó OMO 1kg',       sin: ['sabao em po','sabão em pó','omo'],       preco: 19.90 },
    { nome: 'Sabão em Pó Ariel 1kg',     sin: ['sabao em po','sabão em pó','ariel'],     preco: 18.90 },
    { nome: 'Sabão em Pó Surf 1kg',      sin: ['sabao em po','sabão em pó','surf'],      preco: 14.90 },
    { nome: 'Sabão em Pó Brilhante 1kg', sin: ['sabao em po','sabão em pó','brilhante'], preco: 13.90 },
    { nome: 'Sabão em Pó Ace 1kg',       sin: ['sabao em po','sabão em pó','ace'],       preco: 16.90 },
    { nome: 'Água Sanitária Qboa 1L',    sin: ['agua sanitaria','água sanitária','qboa'], preco: 4.90  },
    { nome: 'Água Sanitária Minuano 1L', sin: ['agua sanitaria','água sanitária','minuano'],preco: 3.90},
    { nome: 'Desinfetante Pinho Sol 500ml',sin:['desinfetante','pinho sol'],             preco: 5.90  },
    { nome: 'Multiuso Mr. Músculo 500ml',sin: ['multiuso','mr musculo','mr. músculo'],   preco: 8.90  },
    { nome: 'Esponja Scotch-Brite un',   sin: ['esponja','scotch-brite'],                preco: 3.90  },
  ],

  doces_biscoitos: [
    { nome: 'Biscoito Oreo 96g',         sin: ['biscoito','oreo','bolacha'],             preco: 5.90  },
    { nome: 'Biscoito Trakinas 126g',    sin: ['biscoito','trakinas','bolacha'],         preco: 4.90  },
    { nome: 'Biscoito Passatempo 150g',  sin: ['biscoito','passatempo','bolacha'],       preco: 4.50  },
    { nome: 'Biscoito Club Social 144g', sin: ['biscoito','club social','bolacha'],      preco: 5.20  },
    { nome: 'Biscoito Maizena Piraquê 200g',sin:['biscoito','maizena','piraque','bolacha'],preco:4.20},
    { nome: 'Chocolate Lacta ao Leite 80g',sin:['chocolate','lacta'],                   preco: 5.90  },
    { nome: 'Chocolate Nestlé Classic 80g',sin:['chocolate','nestle','nestlé classic'], preco: 5.50  },
    { nome: 'Chocolate Garoto 80g',      sin: ['chocolate','garoto'],                    preco: 5.20  },
    { nome: 'Chocolate Hersheys 82g',    sin: ['chocolate','hersheys','hershey'],        preco: 6.50  },
    { nome: 'Chocolate Cacau Show 80g',  sin: ['chocolate','cacau show'],                preco: 7.90  },
  ],

  padaria: [
    { nome: 'Pão de Forma Seven Boys 500g',sin:['pao de forma','pão de forma','seven boys'],preco:8.90},
    { nome: 'Pão de Forma Wickbold 500g',sin: ['pao de forma','pão de forma','wickbold'],preco: 9.50},
    { nome: 'Pão de Forma Pullman 500g', sin: ['pao de forma','pão de forma','pullman'], preco: 8.50 },
    { nome: 'Pão de Forma Nutrella 500g',sin: ['pao de forma','pão de forma','nutrella'],preco: 9.90},
    { nome: 'Pão de Forma Bimbo 500g',   sin: ['pao de forma','pão de forma','bimbo'],   preco: 8.20 },
    { nome: 'Pão Francês kg',            sin: ['pao frances','pão francês','pao'],        preco: 14.90},
    { nome: 'Croissant Leve & Sabor un', sin: ['croissant'],                              preco: 3.90 },
    { nome: 'Bolo de Chocolate Bauduco 250g',sin:['bolo','bauduco'],                     preco: 6.90 },
    { nome: 'Torrada Pullman 160g',      sin: ['torrada','pullman torrada'],              preco: 5.90 },
    { nome: 'Granola Quaker 300g',       sin: ['granola','quaker'],                       preco: 12.90},
  ],

  frios_embutidos: [
    { nome: 'Presunto Cozido Sadia 200g',sin: ['presunto','sadia presunto'],             preco: 9.90  },
    { nome: 'Presunto Cozido Seara 200g',sin: ['presunto','seara presunto'],             preco: 8.90  },
    { nome: 'Presunto Cozido Perdigão 200g',sin:['presunto','perdigao presunto'],        preco: 9.50  },
    { nome: 'Salsicha Viena Sadia 500g', sin: ['salsicha','viena','sadia salsicha'],      preco: 12.90 },
    { nome: 'Salsicha Hot Dog Perdigão 500g',sin:['salsicha','hot dog','perdigao salsicha'],preco:11.90},
    { nome: 'Mortadela Sadia 200g',      sin: ['mortadela','sadia mortadela'],            preco: 7.90  },
    { nome: 'Mortadela Seara 200g',      sin: ['mortadela','seara mortadela'],            preco: 6.90  },
    { nome: 'Peito de Peru Sadia 200g',  sin: ['peito de peru','peru'],                   preco: 14.90 },
    { nome: 'Bacon Fatiado Sadia 200g',  sin: ['bacon','sadia bacon'],                    preco: 11.90 },
    { nome: 'Apresuntado Seara 200g',    sin: ['apresuntado','seara apresuntado'],        preco: 7.90  },
  ],

  congelados: [
    { nome: 'Pizza Sadia Frango Catupiry 440g',sin:['pizza','sadia pizza'],             preco: 19.90 },
    { nome: 'Pizza Seara Mussarela 440g',sin: ['pizza','seara pizza'],                  preco: 17.90 },
    { nome: 'Lasanha Bolonhesa Sadia 600g',sin:['lasanha','sadia lasanha'],             preco: 22.90 },
    { nome: 'Lasanha Bolonhesa Perdigão 600g',sin:['lasanha','perdigao lasanha'],       preco: 21.90 },
    { nome: 'Nuggets de Frango Sadia 300g',sin:['nuggets','sadia nuggets'],             preco: 14.90 },
    { nome: 'Batata Frita McCain 400g',  sin: ['batata frita','mccain'],                 preco: 12.90 },
    { nome: 'Sorvete Kibon Napolitano 1,5L',sin:['sorvete','kibon'],                    preco: 19.90 },
    { nome: 'Sorvete Nestlé Flocos 1,5L',sin: ['sorvete','nestle sorvete'],             preco: 21.90 },
    { nome: 'Empanado de Frango Seara 300g',sin:['empanado','seara empanado'],          preco: 16.90 },
    { nome: 'Peixe Merluza Pescador 400g',sin:['peixe','merluza','pescador'],           preco: 18.90 },
  ],

  pet: [
    { nome: 'Ração Pedigree Adulto 1kg', sin: ['racao','ração','pedigree','ração cachorro'],preco:19.90},
    { nome: 'Ração Purina Dog Chow 1kg', sin: ['racao','ração','purina dog chow'],      preco: 22.90 },
    { nome: 'Ração Golden 1kg',          sin: ['racao','ração','golden'],               preco: 21.90 },
    { nome: 'Ração Whiskas Gato 500g',   sin: ['racao gato','ração gato','whiskas'],    preco: 12.90 },
    { nome: 'Ração Friskies Gato 500g',  sin: ['racao gato','ração gato','friskies'],   preco: 11.90 },
    { nome: 'Areia Sanitária Pipicat 1kg',sin:['areia sanitaria','areia gato','pipicat'],preco:12.90},
    { nome: 'Shampoo Pet Sanol 500ml',   sin: ['shampoo pet','sanol'],                  preco: 14.90 },
    { nome: 'Osso Bifinhos Keldog 65g',  sin: ['petisco','keldog','bifinhos'],          preco: 5.90  },
    { nome: 'Antipulgas Frontline Plus', sin: ['antipulgas','frontline'],               preco: 49.90 },
    { nome: 'Coleira Antipulgas Seresto',sin: ['coleira antipulgas','seresto'],          preco: 89.90 },
  ],

  farmacia: [
    { nome: 'Dipirona 500mg 10 comp',    sin: ['dipirona','dor de cabeca','febre'],      preco: 4.90  },
    { nome: 'Paracetamol 750mg 20 comp', sin: ['paracetamol','tylenol'],                 preco: 6.90  },
    { nome: 'Buscopan Composto 4 comp',  sin: ['buscopan','dor de barriga'],             preco: 9.90  },
    { nome: 'Antisséptico Bucal Listerine 250ml',sin:['listerine','enxaguante'],        preco: 14.90 },
    { nome: 'Band-Aid Curativo 10 un',   sin: ['band-aid','curativo','band aid'],        preco: 5.90  },
    { nome: 'Vitamina C Redoxon 1g 10 comp',sin:['vitamina c','redoxon'],               preco: 24.90 },
    { nome: 'Protetor Solar Sundown FPS50 120ml',sin:['protetor solar','sundown'],      preco: 29.90 },
    { nome: 'Álcool em Gel 70% Farmax 500g',sin:['alcool em gel','álcool em gel'],      preco: 8.90  },
    { nome: 'Termômetro Digital G-Tech',  sin: ['termometro','termômetro'],              preco: 29.90 },
    { nome: 'Repelente Repelex 100ml',    sin: ['repelente','repelex'],                  preco: 19.90 },
  ],
};

// ── Main ──────────────────────────────────────────────────────
async function popular() {
  console.log('🚀 Iniciando população completa...\n');

  // Carregar mercados
  const marketsSnap = await db.collection('markets').limit(15).get();
  const mercados = [];
  marketsSnap.forEach(doc => {
    const d = doc.data();
    mercados.push({
      id:      doc.id,
      name:    d.name || d.marketName || 'Mercado',
      address: d.address || d.marketAddress || '',
      lat:     d.lat || d.marketLat || null,
      lng:     d.lng || d.marketLng || null,
    });
  });

  console.log(`📦 ${mercados.length} mercados carregados\n`);

  const validade = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 dias
  let totalGeral = 0;
  let offset = 0;

  for (const [categoria, produtos] of Object.entries(PRODUTOS)) {
    console.log(`\n📂 Categoria: ${categoria.toUpperCase()} (${produtos.length} produtos)`);
    
    let batch = db.batch();
    let batchCount = 0;
    let countCat = 0;

    for (const produto of produtos) {
      // Cada produto vai para 3 mercados diferentes
      for (let i = 0; i < 3; i++) {
        const idx     = (offset + i) % mercados.length;
        const mercado = mercados[idx];
        const variacao = parseFloat((i * (produto.preco * 0.05)).toFixed(2)); // 5% de variação
        const preco   = parseFloat((produto.preco + variacao).toFixed(2));

        const docRef = db.collection('ofertas_v2').doc();
        batch.set(docRef, {
          nome:                  produto.nome,
          'sinônimos':           produto.sin,
          categoria:             categoria,
          'preço':               preco,
          unidade:               'unidade',
          'ID do mercado':       mercado.id,
          'nome do mercado':     mercado.name,
          'endereço de mercado': mercado.address,
          mercadoLat:            mercado.lat,
          mercadoLng:            mercado.lng,
          nome_da_rede:          '',
          ativo:                 true,
          source:                'popular_completo',
          criadoEm:              admin.firestore.FieldValue.serverTimestamp(),
          expiraEm:              validade.toISOString(),
        });

        batchCount++;
        countCat++;
        totalGeral++;

        if (batchCount === 400) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
      offset++;
    }

    if (batchCount > 0) await batch.commit();
    console.log(`   ✅ ${countCat} ofertas criadas`);
  }

  console.log('\n═══════════════════════════════════════');
  console.log('✅ População completa concluída!');
  console.log(`   Total de ofertas criadas: ${totalGeral}`);
  console.log(`   Categorias: ${Object.keys(PRODUTOS).length}`);
  console.log('═══════════════════════════════════════\n');
  console.log('🎯 Teste agora no WhatsApp:');
  console.log('   "arroz"         → 5 marcas');
  console.log('   "sabão em pó"   → 5 marcas');
  console.log('   "chocolate"     → 5 marcas');
  console.log('   "leite"         → 5 marcas\n');
}

popular().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
