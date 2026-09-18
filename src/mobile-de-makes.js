const MAKE_ENTRIES = [
    ['Mercedes-Benz', '17200'],
    ['Volkswagen', '25200'],
    ['BMW', '3500'],
    ['Audi', '1900'],
    ['Abarth', '140'],
    ['AC', '203'],
    ['Acura', '375'],
    ['Aiways', '31930'],
    ['Aixam', '800'],
    ['Alfa Romeo', '900'],
    ['ALPINA', '1100'],
    ['Alpine', '5'],
    ['Alvis', '32315'],
    ['Ariel', '31876'],
    ['Artega', '121'],
    ['Asia Motors', '1750'],
    ['Aston Martin', '1700'],
    ['Austin', '2000'],
    ['Austin Healey', '1950'],
    ['Auto Union', '32323'],
    ['BAIC', '31863'],
    ['Barkas', '2600'],
    ['BAW', '32363'],
    ['Bentley', '3100'],
    ['Bizzarrini', '32316'],
    ['Borgward', '3850'],
    ['Bovensiepen', '32398'],
    ['Brilliance', '4025'],
    ['Bugatti', '4350'],
    ['Buick', '4400'],
    ['BYD', '31953'],
    ['Cadillac', '4700'],
    ['Casalini', '112'],
    ['Caterham', '5300'],
    ['Cenntro', '31944'],
    ['Changan', '32359'],
    ['Chatenet', '83'],
    ['Chevrolet', '5600'],
    ['Chrysler', '5700'],
    ['Citroën', '5900'],
    ['Cobra', '6200'],
    ['Corvette', '6325'],
    ['Cupra', '3'],
    ['Dacia', '6600'],
    ['Daewoo', '6800'],
    ['Daihatsu', '7000'],
    ['Dallara', '32357'],
    ['Datsun', '30002'],
    ['Delahaye', '32317'],
    ['DeLorean', '32324'],
    ['DeTomaso', '7400'],
    ['DFM', '32395'],
    ['DFSK', '31864'],
    ['Dodge', '7700'],
    ['Donkervoort', '255'],
    ['DS Automobiles', '235'],
    ['e.GO', '31931'],
    ['Elaris', '31932'],
    ['Estrima', '32142'],
    ['Facel Vega', '32318'],
    ['Ferrari', '8600'],
    ['Fiat', '8800'],
    ['Fisker', '172'],
    ['Ford', '9000'],
    ['Foton', '117'],
    ['GAC Gonow', '205'],
    ['Geely', '30005'],
    ['Gemballa', '204'],
    ['Genesis', '270'],
    ['GMC', '9900'],
    ['Grecav', '122'],
    ['GWM', '30006'],
    ['Hamann', '186'],
    ['Heinkel', '32141'],
    ['Holden', '10850'],
    ['Honda', '11000'],
    ['Hongqi', '32228'],
    ['Horch', '32319'],
    ['Hummer', '11050'],
    ['Hyundai', '11600'],
    ['INEOS', '32033'],
    ['Infiniti', '11650'],
    ['Invicta', '32320'],
    ['Isuzu', '11900'],
    ['Iveco', '12100'],
    ['JAC', '30708'],
    ['JAECOO', '32381'],
    ['Jaguar', '12400'],
    ['Jeep', '12600'],
    ['Jetour', '32394'],
    ['Jiayuan', '32305'],
    ['KGM', '32332'],
    ['Kia', '13200'],
    ['Koenigsegg', '13450'],
    ['KTM', '13900'],
    ['Lada', '14400'],
    ['Lamborghini', '14600'],
    ['Lancia', '14700'],
    ['Land Rover', '14800'],
    ['Landwind', '14845'],
    ['Leapmotor', '32303'],
    ['LEVC', '31933'],
    ['Lexus', '15200'],
    ['Ligier', '15400'],
    ['Lincoln', '15500'],
    ['Lotus', '15900'],
    ['Lucid', '32172'],
    ['Lynk&Co', '31934'],
    ['Mahindra', '16200'],
    ['MAN', '16500'],
    ['Maserati', '16600'],
    ['Maxus', '31896'],
    ['Maybach', '16700'],
    ['Mazda', '16800'],
    ['McLaren', '137'],
    ['Messerschmitt', '32321'],
    ['MG', '17300'],
    ['Microcar', '30011'],
    ['Microlino', '32044'],
    ['MINI', '17500'],
    ['Mitsubishi', '17700'],
    ['Morgan', '17900'],
    ['NIO', '31954'],
    ['Nissan', '18700'],
    ['NSU', '18875'],
    ['Oldsmobile', '18975'],
    ['OMODA', '32380'],
    ['Opel', '19000'],
    ['ORA', '31955'],
    ['Packard', '32021'],
    ['Pagani', '149'],
    ['Peugeot', '19300'],
    ['Piaggio', '19600'],
    ['Plymouth', '19800'],
    ['Polestar', '4'],
    ['Pontiac', '20000'],
    ['Porsche', '20100'],
    ['Proton', '20200'],
    ['Renault', '20700'],
    ['Riley', '32322'],
    ['Rimac', '32368'],
    ['Rolls-Royce', '21600'],
    ['Rover', '21700'],
    ['Ruf', '125'],
    ['Saab', '21800'],
    ['Santana', '22000'],
    ['Seat', '22500'],
    ['Seres', '32144'],
    ['Silence', '31920'],
    ['Simca', '293'],
    ['Skoda', '22900'],
    ['Smart', '23000'],
    ['speedART', '188'],
    ['Spyker', '100'],
    ['Ssangyong', '23100'],
    ['Studebaker', '296'],
    ['Subaru', '23500'],
    ['Suzuki', '23600'],
    ['SWM', '247'],
    ['Talbot', '23800'],
    ['Tata', '23825'],
    ['TECHART', '189'],
    ['Tesla', '135'],
    ['Togg', '32369'],
    ['Toyota', '24100'],
    ['Trabant', '24200'],
    ['Triumph', '24400'],
    ['TVR', '24500'],
    ['TYN-e', '32336'],
    ['Vincent', '31389'],
    ['VinFast', '32207'],
    ['Volvo', '25100'],
    ['Voyah', '32375'],
    ['Wartburg', '25300'],
    ['Westfield', '113'],
    ['WEY', '31956'],
    ['Wiesmann', '25650'],
    ['XEV', '32034'],
    ['XPENG', '32208'],
    ['Zeekr', '32331'],
    ['Zhidou', '32032'],
    ['Andere', '1400'],
];

const normalizeMakeLookupKey = (value) =>
    String(value)
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .replace(/&/g, ' AND ')
        .replace(/[’']/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .replace(/\s+/g, ' ')
        .toUpperCase();

export const MOBILE_DE_MAKE_IDS = new Map(MAKE_ENTRIES);

const MAKE_IDS_BY_LOOKUP_KEY = new Map(MAKE_ENTRIES.map(([name, id]) => [normalizeMakeLookupKey(name), id]));

// These are unambiguous names commonly used for the canonical selector labels.
const COMMON_MAKE_ALIASES = new Map([
    ['MERCEDES', '17200'],
    ['VW', '25200'],
    ['CITROEN', '5900'],
    ['DS', '235'],
    ['MINI COOPER', '17500'],
    ['SSANG YONG', '23100'],
    ['LYNK CO', '31934'],
]);

export const getMobileDeMakeId = (value) => {
    if (value === undefined || value === null || String(value).trim() === '') return undefined;

    const rawValue = String(value).trim();
    if (/^\d+$/.test(rawValue)) return rawValue;

    const lookupKey = normalizeMakeLookupKey(rawValue);
    return MAKE_IDS_BY_LOOKUP_KEY.get(lookupKey) || COMMON_MAKE_ALIASES.get(lookupKey);
};

export const requireMobileDeMakeId = (value) => {
    const makeId = getMobileDeMakeId(value);
    if (makeId) return makeId;

    throw new Error(
        `Unknown Mobile.de make "${value}". Use a make name from the Mobile.de selector or its numeric ID; broad userInput search is not used for make filtering.`,
    );
};

export const getMobileDeMakeName = (value) => {
    const makeId = getMobileDeMakeId(value);
    if (!makeId) return undefined;
    return MAKE_ENTRIES.find(([, id]) => id === makeId)?.[0];
};

export { normalizeMakeLookupKey };
