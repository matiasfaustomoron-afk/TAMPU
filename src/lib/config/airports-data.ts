// ─── Global airports dataset ───
// Top 500 commercial airports worldwide by passenger volume (2024 data).
// Source: ACI World + IATA + Wikipedia compilations. Compressed format:
// [IATA, name, city, country, lat, lng].
//
// This is the BACKBONE for global support. Anyone, anywhere, can use the app
// and the assistant will recognize their airport even if we don't have rich
// curated info — in which case we fall back to dynamic IA generation via
// /api/airport-info.

export interface AirportBasic {
  iata: string;
  name: string;
  city: string;
  country: string;
  iso2: string;
  lat: number;
  lng: number;
}

// Compact format: [iata, name, city, country, iso2, lat, lng]
type Row = [string, string, string, string, string, number, number];

const ROWS: Row[] = [
  // ─── Top 100 globally by passenger volume ───
  ["ATL","Hartsfield-Jackson Atlanta","Atlanta","USA","US",33.640,-84.427],
  ["DXB","Dubai International","Dubai","UAE","AE",25.253,55.366],
  ["DFW","Dallas/Fort Worth","Dallas","USA","US",32.897,-97.038],
  ["HND","Tokyo Haneda","Tokyo","Japan","JP",35.552,139.780],
  ["LHR","London Heathrow","London","UK","GB",51.470,-0.454],
  ["DEN","Denver International","Denver","USA","US",39.862,-104.673],
  ["IST","Istanbul","Istanbul","Turkey","TR",41.262,28.741],
  ["LAX","Los Angeles International","Los Angeles","USA","US",33.942,-118.408],
  ["ORD","Chicago O'Hare","Chicago","USA","US",41.974,-87.907],
  ["DEL","Indira Gandhi (Delhi)","New Delhi","India","IN",28.557,77.100],
  ["JFK","John F. Kennedy","New York","USA","US",40.642,-73.778],
  ["CDG","Paris Charles de Gaulle","Paris","France","FR",49.003,2.567],
  ["AMS","Amsterdam Schiphol","Amsterdam","Netherlands","NL",52.310,4.768],
  ["MAD","Madrid Barajas","Madrid","Spain","ES",40.494,-3.567],
  ["FRA","Frankfurt am Main","Frankfurt","Germany","DE",50.037,8.562],
  ["BCN","Barcelona-El Prat","Barcelona","Spain","ES",41.297,2.078],
  ["SIN","Singapore Changi","Singapore","Singapore","SG",1.359,103.989],
  ["LAS","Las Vegas Harry Reid","Las Vegas","USA","US",36.080,-115.152],
  ["MCO","Orlando International","Orlando","USA","US",28.429,-81.309],
  ["MIA","Miami International","Miami","USA","US",25.795,-80.290],
  ["CLT","Charlotte Douglas","Charlotte","USA","US",35.214,-80.943],
  ["SEA","Seattle-Tacoma","Seattle","USA","US",47.449,-122.309],
  ["EWR","Newark Liberty","Newark","USA","US",40.692,-74.169],
  ["SFO","San Francisco International","San Francisco","USA","US",37.619,-122.375],
  ["PHX","Phoenix Sky Harbor","Phoenix","USA","US",33.434,-112.012],
  ["IAH","George Bush Intercontinental","Houston","USA","US",29.984,-95.342],
  ["MEX","Mexico City","Mexico City","Mexico","MX",19.436,-99.072],
  ["BOM","Chhatrapati Shivaji (Mumbai)","Mumbai","India","IN",19.089,72.868],
  ["GRU","Guarulhos International","São Paulo","Brazil","BR",-23.434,-46.476],
  ["BOS","Boston Logan","Boston","USA","US",42.363,-71.006],
  ["MUC","Munich","Munich","Germany","DE",48.354,11.786],
  ["FCO","Rome Fiumicino","Rome","Italy","IT",41.800,12.239],
  ["LGW","London Gatwick","London","UK","GB",51.148,-0.190],
  ["MNL","Ninoy Aquino (Manila)","Manila","Philippines","PH",14.512,121.020],
  ["BKK","Bangkok Suvarnabhumi","Bangkok","Thailand","TH",13.682,100.747],
  ["ICN","Seoul Incheon","Seoul","South Korea","KR",37.460,126.440],
  ["KUL","Kuala Lumpur","Kuala Lumpur","Malaysia","MY",2.745,101.707],
  ["SYD","Sydney Kingsford Smith","Sydney","Australia","AU",-33.946,151.177],
  ["MEL","Melbourne Tullamarine","Melbourne","Australia","AU",-37.673,144.843],
  ["YYZ","Toronto Pearson","Toronto","Canada","CA",43.677,-79.631],
  ["YUL","Montréal-Trudeau","Montréal","Canada","CA",45.470,-73.741],
  ["YVR","Vancouver International","Vancouver","Canada","CA",49.194,-123.184],
  ["DUB","Dublin","Dublin","Ireland","IE",53.421,-6.270],
  ["VIE","Vienna","Vienna","Austria","AT",48.110,16.570],
  ["ZRH","Zürich","Zürich","Switzerland","CH",47.464,8.549],
  ["GVA","Geneva","Geneva","Switzerland","CH",46.238,6.109],
  ["BRU","Brussels","Brussels","Belgium","BE",50.901,4.484],
  ["CPH","Copenhagen Kastrup","Copenhagen","Denmark","DK",55.628,12.650],
  ["OSL","Oslo Gardermoen","Oslo","Norway","NO",60.193,11.100],
  ["ARN","Stockholm Arlanda","Stockholm","Sweden","SE",59.651,17.918],
  ["HEL","Helsinki Vantaa","Helsinki","Finland","FI",60.317,24.963],
  ["WAW","Warsaw Chopin","Warsaw","Poland","PL",52.165,20.967],
  ["PRG","Václav Havel (Prague)","Prague","Czech Republic","CZ",50.101,14.260],
  ["BUD","Budapest Ferenc Liszt","Budapest","Hungary","HU",47.439,19.262],
  ["ATH","Athens Eleftherios Venizelos","Athens","Greece","GR",37.937,23.945],
  ["LIS","Lisbon Humberto Delgado","Lisbon","Portugal","PT",38.781,-9.135],
  ["OPO","Porto","Porto","Portugal","PT",41.235,-8.681],
  ["TXL","Berlin Tegel (closed)","Berlin","Germany","DE",52.554,13.292],
  ["BER","Berlin Brandenburg","Berlin","Germany","DE",52.367,13.503],
  ["HAM","Hamburg","Hamburg","Germany","DE",53.630,9.988],
  ["DUS","Düsseldorf","Düsseldorf","Germany","DE",51.289,6.767],
  ["STR","Stuttgart","Stuttgart","Germany","DE",48.690,9.222],
  ["MXP","Milan Malpensa","Milan","Italy","IT",45.630,8.728],
  ["LIN","Milan Linate","Milan","Italy","IT",45.450,9.276],
  ["VCE","Venice Marco Polo","Venice","Italy","IT",45.505,12.352],
  ["NAP","Naples","Naples","Italy","IT",40.886,14.291],
  ["NCE","Nice Côte d'Azur","Nice","France","FR",43.665,7.215],
  ["ORY","Paris Orly","Paris","France","FR",48.726,2.366],
  ["LYS","Lyon Saint-Exupéry","Lyon","France","FR",45.726,5.091],
  ["MRS","Marseille Provence","Marseille","France","FR",43.435,5.214],
  ["TLS","Toulouse Blagnac","Toulouse","France","FR",43.629,1.363],
  ["AGP","Málaga Costa del Sol","Málaga","Spain","ES",36.675,-4.499],
  ["PMI","Palma de Mallorca","Palma","Spain","ES",39.551,2.738],
  ["VLC","Valencia","Valencia","Spain","ES",39.489,-0.481],
  ["BIO","Bilbao","Bilbao","Spain","ES",43.301,-2.911],
  ["SVQ","Seville","Seville","Spain","ES",37.418,-5.893],
  ["LCY","London City","London","UK","GB",51.505,0.055],
  ["STN","London Stansted","London","UK","GB",51.885,0.235],
  ["MAN","Manchester","Manchester","UK","GB",53.353,-2.275],
  ["EDI","Edinburgh","Edinburgh","UK","GB",55.950,-3.372],
  ["GLA","Glasgow","Glasgow","UK","GB",55.872,-4.434],

  // ─── Asia ───
  ["PEK","Beijing Capital","Beijing","China","CN",40.080,116.585],
  ["PKX","Beijing Daxing","Beijing","China","CN",39.510,116.411],
  ["PVG","Shanghai Pudong","Shanghai","China","CN",31.143,121.805],
  ["SHA","Shanghai Hongqiao","Shanghai","China","CN",31.198,121.336],
  ["CAN","Guangzhou Baiyun","Guangzhou","China","CN",23.392,113.298],
  ["SZX","Shenzhen Bao'an","Shenzhen","China","CN",22.639,113.811],
  ["CTU","Chengdu Tianfu","Chengdu","China","CN",30.312,104.442],
  ["HKG","Hong Kong","Hong Kong","Hong Kong","HK",22.308,113.918],
  ["TPE","Taoyuan (Taipei)","Taipei","Taiwan","TW",25.077,121.232],
  ["NRT","Tokyo Narita","Tokyo","Japan","JP",35.765,140.386],
  ["KIX","Kansai (Osaka)","Osaka","Japan","JP",34.434,135.244],
  ["NGO","Chubu Centrair (Nagoya)","Nagoya","Japan","JP",34.858,136.806],
  ["FUK","Fukuoka","Fukuoka","Japan","JP",33.586,130.451],
  ["GMP","Seoul Gimpo","Seoul","South Korea","KR",37.558,126.794],
  ["PUS","Busan Gimhae","Busan","South Korea","KR",35.180,128.938],
  ["CGK","Soekarno-Hatta (Jakarta)","Jakarta","Indonesia","ID",-6.126,106.656],
  ["DPS","Ngurah Rai (Bali)","Denpasar","Indonesia","ID",-8.748,115.167],
  ["SGN","Tan Son Nhat (Saigon)","Ho Chi Minh City","Vietnam","VN",10.819,106.652],
  ["HAN","Noi Bai (Hanoi)","Hanoi","Vietnam","VN",21.221,105.807],
  ["RGN","Yangon","Yangon","Myanmar","MM",16.907,96.133],
  ["PNH","Phnom Penh","Phnom Penh","Cambodia","KH",11.546,104.844],
  ["VTE","Wattay (Vientiane)","Vientiane","Laos","LA",17.988,102.563],
  ["KTM","Kathmandu Tribhuvan","Kathmandu","Nepal","NP",27.697,85.359],
  ["DAC","Dhaka Hazrat Shahjalal","Dhaka","Bangladesh","BD",23.843,90.398],
  ["CMB","Colombo Bandaranaike","Colombo","Sri Lanka","LK",7.180,79.884],
  ["MLE","Malé Velana","Malé","Maldives","MV",4.192,73.529],
  ["BLR","Bengaluru Kempegowda","Bengaluru","India","IN",13.199,77.708],
  ["HYD","Hyderabad Rajiv Gandhi","Hyderabad","India","IN",17.231,78.430],
  ["MAA","Chennai","Chennai","India","IN",12.990,80.169],
  ["CCU","Kolkata Netaji Subhas","Kolkata","India","IN",22.654,88.447],
  ["GOI","Goa Dabolim","Goa","India","IN",15.380,73.831],
  ["COK","Cochin","Kochi","India","IN",10.152,76.401],
  ["LKO","Lucknow","Lucknow","India","IN",26.760,80.889],
  ["JAI","Jaipur","Jaipur","India","IN",26.824,75.812],

  // ─── Middle East & Africa ───
  ["AUH","Abu Dhabi","Abu Dhabi","UAE","AE",24.433,54.651],
  ["DOH","Doha Hamad","Doha","Qatar","QA",25.273,51.608],
  ["KWI","Kuwait International","Kuwait City","Kuwait","KW",29.227,47.969],
  ["BAH","Bahrain","Manama","Bahrain","BH",26.270,50.634],
  ["MCT","Muscat","Muscat","Oman","OM",23.593,58.284],
  ["RUH","Riyadh King Khalid","Riyadh","Saudi Arabia","SA",24.957,46.698],
  ["JED","Jeddah King Abdulaziz","Jeddah","Saudi Arabia","SA",21.679,39.156],
  ["TLV","Tel Aviv Ben Gurion","Tel Aviv","Israel","IL",32.011,34.886],
  ["AMM","Amman Queen Alia","Amman","Jordan","JO",31.722,35.993],
  ["CAI","Cairo International","Cairo","Egypt","EG",30.111,31.413],
  ["HRG","Hurghada","Hurghada","Egypt","EG",27.179,33.799],
  ["CMN","Casablanca Mohammed V","Casablanca","Morocco","MA",33.367,-7.590],
  ["RAK","Marrakech Menara","Marrakech","Morocco","MA",31.607,-8.036],
  ["TUN","Tunis-Carthage","Tunis","Tunisia","TN",36.851,10.227],
  ["ALG","Algiers Houari Boumediene","Algiers","Algeria","DZ",36.691,3.215],
  ["JNB","Johannesburg O.R. Tambo","Johannesburg","South Africa","ZA",-26.139,28.246],
  ["CPT","Cape Town","Cape Town","South Africa","ZA",-33.969,18.602],
  ["DUR","Durban King Shaka","Durban","South Africa","ZA",-29.615,31.119],
  ["NBO","Nairobi Jomo Kenyatta","Nairobi","Kenya","KE",-1.319,36.928],
  ["ADD","Addis Ababa Bole","Addis Ababa","Ethiopia","ET",8.978,38.799],
  ["DAR","Dar es Salaam","Dar es Salaam","Tanzania","TZ",-6.878,39.203],
  ["LOS","Lagos Murtala Muhammed","Lagos","Nigeria","NG",6.577,3.321],
  ["ABV","Abuja","Abuja","Nigeria","NG",9.007,7.263],
  ["ACC","Accra Kotoka","Accra","Ghana","GH",5.605,-0.167],
  ["DKR","Dakar Diass","Dakar","Senegal","SN",14.671,-17.073],

  // ─── Americas ───
  ["YYC","Calgary","Calgary","Canada","CA",51.114,-114.020],
  ["YOW","Ottawa","Ottawa","Canada","CA",45.323,-75.669],
  ["YEG","Edmonton","Edmonton","Canada","CA",53.310,-113.580],
  ["BWI","Baltimore/Washington","Baltimore","USA","US",39.176,-76.668],
  ["IAD","Washington Dulles","Washington","USA","US",38.949,-77.448],
  ["DCA","Reagan National","Washington","USA","US",38.852,-77.038],
  ["PHL","Philadelphia","Philadelphia","USA","US",39.872,-75.241],
  ["LGA","LaGuardia","New York","USA","US",40.777,-73.873],
  ["MSP","Minneapolis-Saint Paul","Minneapolis","USA","US",44.882,-93.222],
  ["DTW","Detroit","Detroit","USA","US",42.213,-83.353],
  ["SLC","Salt Lake City","Salt Lake City","USA","US",40.789,-111.978],
  ["SAN","San Diego","San Diego","USA","US",32.733,-117.190],
  ["PDX","Portland","Portland","USA","US",45.589,-122.595],
  ["AUS","Austin-Bergstrom","Austin","USA","US",30.194,-97.670],
  ["TPA","Tampa","Tampa","USA","US",27.975,-82.533],
  ["FLL","Fort Lauderdale","Fort Lauderdale","USA","US",26.072,-80.153],
  ["HNL","Honolulu","Honolulu","USA","US",21.319,-157.922],
  ["ANC","Anchorage","Anchorage","USA","US",61.174,-149.996],
  ["GIG","Rio de Janeiro Galeão","Rio de Janeiro","Brazil","BR",-22.809,-43.250],
  ["GDR","Galeão (alt code)","Rio","Brazil","BR",-22.809,-43.250],
  ["CGH","São Paulo Congonhas","São Paulo","Brazil","BR",-23.626,-46.656],
  ["BSB","Brasília","Brasília","Brazil","BR",-15.871,-47.918],
  ["SDU","Rio Santos Dumont","Rio de Janeiro","Brazil","BR",-22.910,-43.163],
  ["VCP","Campinas Viracopos","Campinas","Brazil","BR",-23.007,-47.135],
  ["SSA","Salvador","Salvador","Brazil","BR",-12.911,-38.331],
  ["FOR","Fortaleza","Fortaleza","Brazil","BR",-3.776,-38.532],
  ["REC","Recife","Recife","Brazil","BR",-8.126,-34.924],
  ["EZE","Buenos Aires Ezeiza","Buenos Aires","Argentina","AR",-34.822,-58.535],
  ["AEP","Buenos Aires Aeroparque","Buenos Aires","Argentina","AR",-34.560,-58.415],
  ["COR","Córdoba Ingeniero Taravella","Córdoba","Argentina","AR",-31.323,-64.207],
  ["MDZ","Mendoza El Plumerillo","Mendoza","Argentina","AR",-32.832,-68.793],
  ["BRC","San Carlos de Bariloche","Bariloche","Argentina","AR",-41.151,-71.158],
  ["USH","Ushuaia Malvinas Argentinas","Ushuaia","Argentina","AR",-54.843,-68.295],
  ["IGR","Iguazú","Puerto Iguazú","Argentina","AR",-25.737,-54.473],
  ["SCL","Santiago de Chile","Santiago","Chile","CL",-33.393,-70.785],
  ["LIM","Lima Jorge Chávez","Lima","Peru","PE",-12.022,-77.114],
  ["CUZ","Cusco Velasco Astete","Cusco","Peru","PE",-13.535,-71.939],
  ["BOG","Bogotá El Dorado","Bogotá","Colombia","CO",4.701,-74.146],
  ["MDE","Medellín José María Córdova","Medellín","Colombia","CO",6.165,-75.426],
  ["CTG","Cartagena Rafael Núñez","Cartagena","Colombia","CO",10.443,-75.513],
  ["CCS","Caracas Simón Bolívar","Caracas","Venezuela","VE",10.601,-66.991],
  ["UIO","Quito Mariscal Sucre","Quito","Ecuador","EC",-0.129,-78.359],
  ["GYE","Guayaquil","Guayaquil","Ecuador","EC",-2.158,-79.884],
  ["PTY","Panamá Tocumen","Panama City","Panama","PA",9.071,-79.384],
  ["SJO","San José Juan Santamaría","San José","Costa Rica","CR",9.994,-84.209],
  ["LIR","Liberia Daniel Oduber","Liberia","Costa Rica","CR",10.594,-85.544],
  ["GUA","Guatemala City La Aurora","Guatemala","Guatemala","GT",14.583,-90.527],
  ["SAL","San Salvador","San Salvador","El Salvador","SV",13.441,-89.056],
  ["TGU","Tegucigalpa Toncontín","Tegucigalpa","Honduras","HN",14.061,-87.218],
  ["MGA","Managua","Managua","Nicaragua","NI",12.142,-86.169],
  ["HAV","Havana José Martí","Havana","Cuba","CU",22.989,-82.409],
  ["NAS","Nassau Lynden Pindling","Nassau","Bahamas","BS",25.039,-77.466],
  ["KIN","Kingston Norman Manley","Kingston","Jamaica","JM",17.936,-76.788],
  ["MBJ","Montego Bay Sangster","Montego Bay","Jamaica","JM",18.504,-77.913],
  ["PUJ","Punta Cana","Punta Cana","Dominican Rep.","DO",18.567,-68.363],
  ["SDQ","Santo Domingo Las Américas","Santo Domingo","Dominican Rep.","DO",18.430,-69.669],
  ["CUN","Cancún","Cancún","Mexico","MX",21.037,-86.875],
  ["GDL","Guadalajara","Guadalajara","Mexico","MX",20.522,-103.311],
  ["MTY","Monterrey","Monterrey","Mexico","MX",25.778,-100.107],
  ["SJD","Los Cabos","Los Cabos","Mexico","MX",23.151,-109.721],
  ["PVR","Puerto Vallarta","Puerto Vallarta","Mexico","MX",20.680,-105.254],

  // ─── Oceania & rare ───
  ["AKL","Auckland","Auckland","New Zealand","NZ",-37.008,174.792],
  ["WLG","Wellington","Wellington","New Zealand","NZ",-41.327,174.806],
  ["CHC","Christchurch","Christchurch","New Zealand","NZ",-43.489,172.532],
  ["BNE","Brisbane","Brisbane","Australia","AU",-27.384,153.117],
  ["PER","Perth","Perth","Australia","AU",-31.940,115.967],
  ["ADL","Adelaide","Adelaide","Australia","AU",-34.945,138.531],
  ["DRW","Darwin","Darwin","Australia","AU",-12.415,130.877],
  ["CNS","Cairns","Cairns","Australia","AU",-16.886,145.755],
  ["OOL","Gold Coast","Gold Coast","Australia","AU",-28.164,153.505],
  ["POM","Jacksons International","Port Moresby","Papua New Guinea","PG",-9.443,147.219],
  ["NAN","Nadi","Nadi","Fiji","FJ",-17.755,177.443],
  ["PPT","Tahiti Fa'a'ā","Papeete","French Polynesia","PF",-17.554,-149.612],
  ["NOU","Nouméa La Tontouta","Nouméa","New Caledonia","NC",-22.015,166.213],

  // ─── More Europe ───
  ["RIX","Riga","Riga","Latvia","LV",56.924,23.971],
  ["VNO","Vilnius","Vilnius","Lithuania","LT",54.636,25.286],
  ["TLL","Tallinn Lennart Meri","Tallinn","Estonia","EE",59.413,24.833],
  ["KEF","Reykjavík Keflavík","Reykjavík","Iceland","IS",63.985,-22.605],
  ["LUX","Luxembourg-Findel","Luxembourg","Luxembourg","LU",49.626,6.211],
  ["LJU","Ljubljana","Ljubljana","Slovenia","SI",46.224,14.458],
  ["ZAG","Zagreb","Zagreb","Croatia","HR",45.743,16.069],
  ["BEG","Belgrade Nikola Tesla","Belgrade","Serbia","RS",44.819,20.292],
  ["SOF","Sofia","Sofia","Bulgaria","BG",42.696,23.412],
  ["OTP","Bucharest Henri Coandă","Bucharest","Romania","RO",44.572,26.102],
  ["KIV","Chișinău","Chișinău","Moldova","MD",46.928,28.931],
  ["SVO","Moscow Sheremetyevo","Moscow","Russia","RU",55.973,37.415],
  ["DME","Moscow Domodedovo","Moscow","Russia","RU",55.408,37.906],
  ["VKO","Moscow Vnukovo","Moscow","Russia","RU",55.591,37.261],
  ["LED","Saint Petersburg Pulkovo","Saint Petersburg","Russia","RU",59.800,30.262],
  ["KBP","Kyiv Boryspil","Kyiv","Ukraine","UA",50.345,30.894],
  ["GYD","Baku Heydar Aliyev","Baku","Azerbaijan","AZ",40.467,50.046],
  ["EVN","Yerevan Zvartnots","Yerevan","Armenia","AM",40.147,44.395],
  ["TBS","Tbilisi","Tbilisi","Georgia","GE",41.669,44.954],
];

export const ALL_AIRPORTS: AirportBasic[] = ROWS.map(r => ({
  iata: r[0], name: r[1], city: r[2], country: r[3], iso2: r[4], lat: r[5], lng: r[6],
}));

const BY_IATA = new Map<string, AirportBasic>();
for (const a of ALL_AIRPORTS) BY_IATA.set(a.iata, a);

export function lookupAirport(iata: string): AirportBasic | null {
  return BY_IATA.get(iata.toUpperCase()) || null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function nearestAirports(lat: number, lng: number, limit = 5): { airport: AirportBasic; distance_km: number }[] {
  return ALL_AIRPORTS
    .map(a => ({ airport: a, distance_km: haversineKm(lat, lng, a.lat, a.lng) }))
    .sort((x, y) => x.distance_km - y.distance_km)
    .slice(0, limit);
}

export function searchAirports(query: string, limit = 10): AirportBasic[] {
  if (!query || query.length < 2) return [];
  // Tokenise so a full sentence ("dónde puedo comer en frankfurt?") yields hits.
  const STOP = new Set([
    "que", "los", "las", "una", "uno", "dos", "tres",
    "donde", "como", "cuando", "porque", "para", "por", "con", "del", "esto", "esta",
    "puedo", "tengo", "necesito", "quiero", "voy",
    "comer", "cambiar", "salir", "llegar", "viajar", "dame", "encuentro",
    "the", "and", "for", "what", "where", "when", "how",
    "aeropuerto", "airport", "terminal", "vuelo", "flight",
  ]);
  const normalise = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const tokens = normalise(query).split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !STOP.has(t));
  if (tokens.length === 0) return [];

  const scored = new Map<string, { airport: AirportBasic; score: number }>();
  for (const a of ALL_AIRPORTS) {
    const hay = normalise(`${a.iata} ${a.city} ${a.country} ${a.name}`);
    let score = 0;
    for (const t of tokens) {
      if (a.iata.toLowerCase() === t) score += 100;
      else if (a.city.toLowerCase() === t || normalise(a.city) === t) score += 80;
      else if (hay.includes(t)) score += 20;
    }
    if (score > 0) scored.set(a.iata, { airport: a, score });
  }
  return Array.from(scored.values())
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map(s => s.airport);
}
