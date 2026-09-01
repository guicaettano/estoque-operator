export type GoldMatchStatus = "CONFIRMED" | "NOT_IN_CATALOG" | "UNVERIFIED";
export type GoldVerification = GoldMatchStatus;

export type RetrievalCaseCategory =
  | "EXACT_OR_NEAR_EXACT"
  | "ALIAS_VARIATION"
  | "ABBREVIATION"
  | "VEHICLE_HEAVY"
  | "PART_TYPE_AMBIGUOUS"
  | "NOT_IN_CATALOG"
  | "UNVERIFIED";

export type MatchingGoldItem = {
  supplierCode: string;
  description: string;
  correctCciExternalId: string | null;
  correctTagPlusExternalId: string | null;
  cciVerification: GoldMatchStatus;
  tagPlusVerification: GoldMatchStatus;
  retrievalCategory: Exclude<RetrievalCaseCategory, "NOT_IN_CATALOG" | "UNVERIFIED">;
  notes?: string;
};

// CONFIRMED exige externalId; NOT_IN_CATALOG e UNVERIFIED exigem null.
// Apenas CONFIRMED participa de Recall@K. A categoria efetiva do provider vira
// NOT_IN_CATALOG ou UNVERIFIED conforme o status; caso contrário usa a categoria
// linguística abaixo.
export const osiasMatchingGold: MatchingGoldItem[] = [
  { supplierCode: "55022", description: "ANEL ESCAPE DAFRA RIVA 150(5,UND) VEDAM", correctCciExternalId: "984", correctTagPlusExternalId: "4106", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "EXACT_OR_NEAR_EXACT", notes: "CCI confirmado manualmente. TagPlus: UNVERIFIED." },
  { supplierCode: "24112", description: "BORRACHA REPARO FREIO (PINCA) TIT 00/150 OSI", correctCciExternalId: "5988", correctTagPlusExternalId: "5913", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "ABBREVIATION", notes: "UNVERIFIED." },
  { supplierCode: "21892", description: "CABO VELOCIMETRO TIT 2000 ES OSI", correctCciExternalId: "944", correctTagPlusExternalId: "4474", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "ABBREVIATION", notes: "UNVERIFIED." },
  { supplierCode: "45135", description: "CAMARA AR TRAS BIZ (LARGA)", correctCciExternalId: "1047", correctTagPlusExternalId: "1543", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "VEHICLE_HEAVY", notes: "UNVERIFIED." },
  { supplierCode: "33642", description: "CAMARA AR TRAS/DIANT CG OSI", correctCciExternalId: "1033", correctTagPlusExternalId: "4749", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "VEHICLE_HEAVY", notes: "UNVERIFIED." },
  { supplierCode: "52191", description: "CANELA BENGALA DIR TIT 150 04/08 ESD OSI", correctCciExternalId: "1798", correctTagPlusExternalId: "5398", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "ALIAS_VARIATION", notes: "CCI confirmado manualmente: #1798 CILINDRO EXT BENGALA TITAN 150 ESD DIR - OSI. TagPlus: UNVERIFIED." },
  { supplierCode: "27316", description: "CHAVE LUZ TIT 2000 ES OSI", correctCciExternalId: "1702", correctTagPlusExternalId: "5354", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "ABBREVIATION", notes: "UNVERIFIED." },
  { supplierCode: "27315", description: "CHAVE LUZ TIT 2000 KS OSI", correctCciExternalId: "1709", correctTagPlusExternalId: "5258", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "ABBREVIATION", notes: "UNVERIFIED." },
  { supplierCode: "41305", description: "CILINDRO KIT P.MOLA SHINERAY 90CC OSI", correctCciExternalId: "3301", correctTagPlusExternalId: null, cciVerification: "CONFIRMED", tagPlusVerification: "UNVERIFIED", retrievalCategory: "PART_TYPE_AMBIGUOUS", notes: "UNVERIFIED." },
  { supplierCode: "45602", description: "CONDUTOR AR CG/TIT 99 OSI", correctCciExternalId: "1872", correctTagPlusExternalId: "3647", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "PART_TYPE_AMBIGUOUS", notes: "UNVERIFIED." },
  { supplierCode: "19944", description: "CORRENTE COMANDO SHINERAY XY-50Q 82L OSI", correctCciExternalId: "1915", correctTagPlusExternalId: null, cciVerification: "CONFIRMED", tagPlusVerification: "UNVERIFIED", retrievalCategory: "VEHICLE_HEAVY", notes: "UNVERIFIED. Busca anterior não confirma ausência do catálogo." },
  { supplierCode: "40259", description: "DISCO FREIO DIANT TIT 00/BROS 160 OSI", correctCciExternalId: "2015", correctTagPlusExternalId: "4841", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "VEHICLE_HEAVY", notes: "UNVERIFIED." },
  { supplierCode: "32360", description: "EIXO ABRE PATIN TRAS/DIANT CB 300/TWI/TOR OSI", correctCciExternalId: "2023", correctTagPlusExternalId: "4061", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "PART_TYPE_AMBIGUOUS", notes: "UNVERIFIED." },
  { supplierCode: "37516", description: "ESCAPE M.ORIG YBR 00/08 TORK", correctCciExternalId: "2341", correctTagPlusExternalId: "1867", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "ALIAS_VARIATION", notes: "UNVERIFIED." },
  { supplierCode: "46811", description: "FIACAO PAINEL CG/TIT 99 OSI", correctCciExternalId: "3889", correctTagPlusExternalId: "2938", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "ALIAS_VARIATION", notes: "UNVERIFIED." },
  { supplierCode: "29841", description: "GUIA CORRENTE TRANS BROS 125/150 OSI", correctCciExternalId: "2652", correctTagPlusExternalId: "5621", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "ALIAS_VARIATION", notes: "UNVERIFIED." },
  { supplierCode: "45377", description: "INTERRUPTOR PART YBR 02/05 E OSI", correctCciExternalId: "2773", correctTagPlusExternalId: null, cciVerification: "CONFIRMED", tagPlusVerification: "UNVERIFIED", retrievalCategory: "ABBREVIATION", notes: "UNVERIFIED." },
  { supplierCode: "45378", description: "INTERRUPTOR PART YBR 06/08 E/09/13 ED OSI", correctCciExternalId: "2772", correctTagPlusExternalId: "2973", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "ABBREVIATION", notes: "UNVERIFIED." },
  { supplierCode: "25610", description: "MANICOTO EMBR FAZER/LANDER/TENERE/XT 600 COMETA", correctCciExternalId: "3725", correctTagPlusExternalId: "6286", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "ABBREVIATION", notes: "UNVERIFIED. TagPlus #6286 é apenas candidato e exige confirmação manual." },
  { supplierCode: "55189", description: "MATA C. C/TELA 150 04/08 CROM TORK SPORT", correctCciExternalId: null, correctTagPlusExternalId: null, cciVerification: "UNVERIFIED", tagPlusVerification: "UNVERIFIED", retrievalCategory: "PART_TYPE_AMBIGUOUS", notes: "UNVERIFIED. MATA C. significa PROTETOR DIANTEIRO. O antigo TagPlus #4364 era TAMPA LATERAL e foi invalidado; externalId correto ainda não confirmado." },
  { supplierCode: "53163", description: "MATA C. C/TELA 99/00/FAN 08 CROM TORK SPORT PR-", correctCciExternalId: "4859", correctTagPlusExternalId: "5060", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "PART_TYPE_AMBIGUOUS", notes: "UNVERIFIED. MATA C. significa protetor dianteiro; externalId ainda não confirmado." },
  { supplierCode: "6396", description: "MOTOR PARTIDA TIT 150 04/14 MAGN", correctCciExternalId: "2739", correctTagPlusExternalId: "5141", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "ABBREVIATION", notes: "UNVERIFIED." },
  { supplierCode: "59532", description: "PROTETOR ESCAPE YBR 00/08 OSI", correctCciExternalId: "4884", correctTagPlusExternalId: null, cciVerification: "CONFIRMED", tagPlusVerification: "UNVERIFIED", retrievalCategory: "ALIAS_VARIATION", notes: "UNVERIFIED." },
  { supplierCode: "45140", description: "SOQUETE LANTERNA TRAS BROS 160/XRE 190 15/24 MAGN", correctCciExternalId: "5649", correctTagPlusExternalId: null, cciVerification: "CONFIRMED", tagPlusVerification: "NOT_IN_CATALOG", retrievalCategory: "VEHICLE_HEAVY", notes: "UNVERIFIED." },
  { supplierCode: "5409", description: "SUPORTE ESCAPE CG/TIT 99 OSI", correctCciExternalId: "5685", correctTagPlusExternalId: "4403", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "ABBREVIATION", notes: "UNVERIFIED." },
  { supplierCode: "22801", description: "SUPORTE ESCAPE TIT 150 09/13 KS/ES/ESI OSI", correctCciExternalId: "5691", correctTagPlusExternalId: null, cciVerification: "CONFIRMED", tagPlusVerification: "NOT_IN_CATALOG", retrievalCategory: "ABBREVIATION", notes: "UNVERIFIED." },
  { supplierCode: "57314", description: "TUBO INTERNO BENGALA TIT 150/160 OSI", correctCciExternalId: "5688", correctTagPlusExternalId: "5398", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "ABBREVIATION", notes: "UNVERIFIED." },
  { supplierCode: "54079", description: "VARETA FREIO CG/TIT 99/00 OSI", correctCciExternalId: "6069", correctTagPlusExternalId: "6208", cciVerification: "CONFIRMED", tagPlusVerification: "CONFIRMED", retrievalCategory: "VEHICLE_HEAVY", notes: "UNVERIFIED." },
];
