export type RealMotoGoldItem = {
  supplierCode: string;
  description: string;
  expectedCciExternalId: string | null;
  expectedTagPlusExternalId: string | null;
  notes?: string;
};

export const realMoto29Gold: RealMotoGoldItem[] = [
  { supplierCode: "MMCX001", description: "COXIM COROA TRANSMISSAO", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "MMRP001", description: "BUCHA GARFO TRASEIRO KIT", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "10116971", description: "CORRENTE COMANDO (404SV-94L)", expectedCciExternalId: "1899", expectedTagPlusExternalId: null },
  { supplierCode: "CR22540M", description: "AMORTECEDOR TRASEIRO C/REGULAGEM", expectedCciExternalId: null, expectedTagPlusExternalId: "4643" },
  { supplierCode: "TIC41002M", description: "TUBO INTERNO BENGALA", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "DFH00123", description: "PATIM FREIO DIANTEIRO/TRASEIRO", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "DFH00123A", description: "PATIM FREIO TRASEIRO SOBMEDIDA 0,25MM", expectedCciExternalId: "3578", expectedTagPlusExternalId: null, notes: "#6295 também é semanticamente plausível; preservar revisão humana." },
  { supplierCode: "DFH00127B", description: "PATIM FREIO DIANT/TRAS SOBMEDIDA 0,50MM", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "DFY00211", description: "PATIM FREIO DIANTEIRO/TRASEIRO", expectedCciExternalId: "3604", expectedTagPlusExternalId: "4731" },
  { supplierCode: "KL741", description: "FILTRO COMBUSTIVEL", expectedCciExternalId: null, expectedTagPlusExternalId: "1820" },
  { supplierCode: "VA0510029", description: "VALVULA MOTOR ADM (30 X 5.43 X 92.88)", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "90271190", description: "CDI MODULO IGNICAO", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "M730001047000", description: "RETENTOR PINHAO 20X34X7", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "M730900290000", description: "RETENTOR EMBREAGEM 12X22X5", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "VE05084000001", description: "JUNTA TAMPA VALVULA C/COXIM", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "VE99016001085", description: "JUNTA GUARNICAO TAMPA VALVULA", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "VS05610000120", description: "KIT A JUNTA SUPERIOR MOTOR", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "VS05610000145", description: "KIT A JUNTA SUPERIOR MOTOR METALICA", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "VS05610000175", description: "KIT A JUNTA SUPERIOR MOTOR", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "VS05700000002", description: "JUNTA MOTOR", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "VS05700000140", description: "JUNTA MOTOR", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "VS05700000170", description: "JUNTA MOTOR", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "VS05700000260", description: "JUNTA MOTOR", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "VS05700010001", description: "JUNTA MOTOR", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "VS10004090184", description: "JUNTA ESTATOR TAMPA LATERAL ESQUERDA", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "VS10700000660", description: "JUNTA MOTOR C/J.CAB. METALICA", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "752000610", description: "ROLAMENTO VIRABREQUIM", expectedCciExternalId: "5550", expectedTagPlusExternalId: null, notes: "Referência exata, mas posição ausente no input exige revisão." },
  { supplierCode: "7666N", description: "RETENTOR PINHAO 20X38X5", expectedCciExternalId: null, expectedTagPlusExternalId: null },
  { supplierCode: "0302CP", description: "PATIM FREIO DIANTEIRO/TRASEIRO", expectedCciExternalId: null, expectedTagPlusExternalId: null },
];
