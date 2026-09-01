import { normalizeProductDescription, productTokens } from "@/lib/product-matching/normalize";
import type { ParsedProductIntent } from "@/lib/product-matching/types";
import type { PurchaseDocumentItem } from "@/lib/purchase-documents/types";

const DOMAIN_PART_TYPE_ALIASES: Array<[string, string[]]> = [
  ["PROTETOR DIANTEIRO", ["PROTETOR DIANTEIRO", "PROTETOR DIANT", "MATA CACHORRO", "MATA CAO", "MATA C"]],
];

const PART_TYPE_ALIASES: Array<[string, string[]]> = [["COXIM COROA TRANSMISSAO",["COXIM COROA TRANSMISSAO","COXIM COROA","BORR COROA"]],["COXIM ESCAPAMENTO",["COXIM ESCAPAMENTO","COXIM ESCAP"]],["COXIM MOTOR",["COXIM MOTOR"]],["RETENTOR EMBREAGEM",["RETENTOR EMBREAGEM","RETENTOR EMBR"]],["INTERRUPTOR EMBREAGEM",["INTERRUPTOR EMBREAGEM","INTERRUPTOR MOTO FREIO EMBREAGEM"]],["DISCO EMBREAGEM",["DISCO EMBREAGEM"]],["FILTRO COMBUSTIVEL",["FILTRO COMBUSTIVEL","FILTRO MOTO COMBUSTIVEL"]],["BOMBA COMBUSTIVEL",["BOMBA COMBUSTIVEL"]],["PATIM FREIO",["PATIM FREIO","LONA FREIO"]],["AMORTECEDOR",["AMORTECEDOR"]],["TENSOR CORRENTE COMANDO",["TENSOR CORRENTE COMANDO"]],["CORRENTE COMANDO",["CORRENTE COMANDO","CORR COMANDO"]],["ACIONAMENTO EMBREAGEM",["MANICOTO EMBREAGEM","MANICOTO EMBR","MANETE EMBREAGEM","MANETE EMBR"]],["RETENTOR",["RETENTOR"]],["VARETA FREIO",["VARETA FREIO"]],["ESCOVA MOTOR",["ESCOVA MOTOR"]],["CABO VELOCIMETRO",["CABO VELOCIMETRO","CABO VELOC"]],["CABO EMBREAGEM",["CABO EMBREAGEM","CABO EMB"]],["PASTILHA FREIO",["PASTILHA FREIO","PASTILHA"]],["CANELA BENGALA",["CANELA BENGALA","CANELA"]],["TUBO INTERNO BENGALA",["TUBO INTERNO BENGALA","TUBO BENGALA"]],["KIT RELACAO",["KIT RELACAO","KIT TRANSMISSAO","KIT CORR/COROA/PINHAO"]],["JUNTA MOTOR",["JG JUNTA MOTO","JG JUNTA MOTOR","JUNTA MOTO","JUNTA MOTOR"]],["ANEL ESCAPE",["ANEL MOTO ESCAP","ANEL ESCAP","ANEL ESCAPE"]],["REPARO FREIO PINCA",["REPARO FREIO PINCA","BORRACHA REPARO FREIO","REPARO MOTO FREIO DISCO","REPARO FREIO DISCO"]],["INTERRUPTOR PARTIDA",["INTERRUPTOR MOTO PARTIDA","INTERRUPTOR PARTIDA","INTERRUPTOR PART"]],["INTERRUPTOR EMERGENCIA",["INTERRUPTOR MOTO EMERGENCIA","INTERRUPTOR EMERGENCIA"]],["EIXO ABRE PATIM",["EIXO ABRE PATIM","EIXO ABRI PATIM","EIXO ABRE PATIN","EIXO ABRI PATIN"]],["GUIA CORRENTE TRACAO",["GUIA CORRENTE TRANS","GUIA CORRENTE TRACAO","GUIA CORR TRACAO"]],["FILTRO OLEO",["FILTRO OLEO"]],["FILTRO AR",["FILTRO AR"]],["RETENTOR BENGALA",["RETENTOR BENGALA"]],["DISCO FREIO",["DISCO FREIO"]],["ROLAMENTO",["ROLAMENTO"]],["VELA IGNICAO",["VELA IGNICAO","VELA"]],["PROTETOR DIANT",["PROTETOR DIANT","PROTETOR DIANTEIRO"]],["BAGAGEIRO",["BAGAGEIRO"]],["CARCACA PAINEL",["CARCACA SUP PAINEL","CARCACA PAINEL"]]];
const ENGINE_SIZES = new Set(["50","90","100","110","125","135","150","160","170","190","200","230","250","300","400","500","600","650","750","1000"]);
const POSITIONS: Record<string,string> = { DIANT:"DIANT",DIANTEIRA:"DIANT",DIANTEIRO:"DIANT",TRAS:"TRAS",TRASEIRA:"TRAS",TRASEIRO:"TRAS",DIR:"DIR",DIREITA:"DIR",DIREITO:"DIR",ESQ:"ESQ",ESQUERDA:"ESQ",ESQUERDO:"ESQ" };
const VARIANTS = new Set(["ES","KS","ESD","ESI","EX","ED","KSE","FLEX","MIX"]);
const BRANDS: Record<string,string> = { OSI:"OSI",VEDA:"VEDAMOTORS",VEDAM:"VEDAMOTORS",VEDAMOTORS:"VEDAMOTORS",COBREQ:"COBREQ",SCUD:"SCUD",RIFFEL:"RIFFEL",NAKATA:"NAKATA",SKF:"SKF",MAGNETRON:"MAGNETRON",SMARTFOX:"SMARTFOX",DID:"DID",WW3:"WW3",BHD:"BHD",MHX:"MHX" };
const MODEL_ALIASES: Record<string,string> = { TIT:"TITAN",TITAN:"TITAN",FAN:"FAN",BROS:"BROS",BIZ:"BIZ",POP:"POP",CG:"CG",CB:"CB",CBX:"CBX",CB300:"CB300",XRE:"XRE",NXR:"NXR",NX:"NX",XR:"XR",XL:"XL",XLS:"XLS",ML:"ML",TUR:"TURUNA",TURUNA:"TURUNA",YES:"YES",TW:"TWISTER",TWISTER:"TWISTER",YBR:"YBR",FACTOR:"FACTOR",FAZER:"FAZER",SHINERAY:"SHINERAY" };
const MOTO_DOMAIN_TOKENS = new Set(["CDI","GARFO","BENGALA","COROA","PINHAO",...Object.keys(MODEL_ALIASES)]);
const CAR_DOMAIN_TOKENS = new Set(["GOL","PARATI","CORSA","CELTA","FIAT","GM","VW","PALIO","UNO","SAVEIRO","STRADA","FIESTA","FORD","ASTRA","D20","PAMPA","CORCEL","BELINA","TORO","COMPASS","RENAULT"]);
function includedPhrase(normalized:string, phrase:string) { return (` ${normalized} `).includes(` ${phrase} `); }
export function parseProductIntent(item: PurchaseDocumentItem): ParsedProductIntent {
  const normalized = normalizeProductDescription(item.description);
  const tokens = productTokens(normalized.replaceAll("/", " "));
  const partType = [...DOMAIN_PART_TYPE_ALIASES, ...PART_TYPE_ALIASES].find(([, aliases]) => aliases.some((alias) => includedPhrase(normalized, alias)))?.[0] ?? null;
  const engineSizes = tokens.filter((token) => ENGINE_SIZES.has(token.replace(/CC$/, ""))).map((token) => token.replace(/CC$/, ""));
  const years = tokens.filter((token) => /^(?:19|20)\d{2}$/.test(token));
  const positions = tokens.flatMap((token) => POSITIONS[token] ? [POSITIONS[token]] : []);
  const variants = tokens.filter((token) => VARIANTS.has(token));
  const brandToken = tokens.find((token) => BRANDS[token]);
  const rawDecimals = [...item.description.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().matchAll(/\b(\d+)[,.](\d+)\s*(MM)?\b/g)];
  const decimalSpecifications = rawDecimals.map((match) => `${Number(match[1])}.${match[2]}`);
  const decimalFragments = new Set(rawDecimals.map((match) => `${match[2]}${match[3] ?? ""}`));
  const tokenSpecifications = tokens.filter((token) => /^\d+(?:L|D|MM|V)$/.test(token) && !decimalFragments.has(token));
  const specifications = [...decimalSpecifications, ...tokenSpecifications];
  const vehicleModels: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const canonical = MODEL_ALIASES[tokens[index]];
    if (!canonical) continue;
    if (canonical === "SHINERAY") {
      const suffix = tokens.slice(index + 1, index + 3).filter((token) => /[A-Z]/.test(token) && !BRANDS[token] && !VARIANTS.has(token) && !specifications.includes(token));
      vehicleModels.push([canonical, ...suffix].join(" "));
    } else vehicleModels.push(canonical);
  }
  const hasMotoEvidence = tokens.some((token) => MOTO_DOMAIN_TOKENS.has(token));
  const hasCarEvidence = tokens.some((token) => CAR_DOMAIN_TOKENS.has(token));
  const domain = hasMotoEvidence && !hasCarEvidence ? "MOTO" : hasCarEvidence && !hasMotoEvidence ? "CAR" : "UNKNOWN";
  return { rawDescription: item.description, partType, domain, vehicleModels: [...new Set(vehicleModels)], engineSizes: [...new Set(engineSizes)], years: [...new Set(years)], positions: [...new Set(positions)], variants: [...new Set(variants)], brand: brandToken ? BRANDS[brandToken] : null, reference: item.supplierReference ? normalizeProductDescription(item.supplierReference) : null, specifications: [...new Set(specifications)] };
}
