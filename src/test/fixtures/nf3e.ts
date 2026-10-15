// Gerador de XMLs no leiaute da NF3e (modelo 66) para testes automatizados.
// Reproduz a estrutura de grupos do leiaute oficial (ide, emit, dest, acessante,
// gGrContrat, gMed, NFdet/det/detItem, total, gFat, protNF3e).

export function chaveComDv(base43: string): string {
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return base43 + String(resto < 2 ? 0 : 11 - resto);
}

export function gerarChave(numero: number, cnpjEmitente = "02341467000120", aamm = "2601"): string {
  const nNF = String(numero).padStart(9, "0");
  const base = `35${aamm}${cnpjEmitente}66001${nNF}1${String(numero).padStart(8, "0")}`;
  return chaveComDv(base.slice(0, 43));
}

export interface ItemFixture {
  descricao: string;
  qtd?: number;
  uMed?: string;
  vItem?: number;
  vProd: number;
  devolucao?: boolean;
  cPosTarif?: string;
  cClass?: string;
  medida?: { tpGrMed: string; uMed: string; ant: number; atu: number; constante?: number };
  icms?: number;
}

export interface OpcoesNF3e {
  numero?: number;
  uc?: string | null;
  competencia?: string | null;
  cnpjDest?: string;
  dhEmi?: string;
  dVenc?: string;
  dMedAnt?: string;
  dMedAtu?: string;
  vNF?: number;
  vICMS?: number;
  vPIS?: number;
  vCOFINS?: number;
  itens?: ItemFixture[];
  protocolo?: boolean;
  cStat?: string;
  finNF3e?: string;
  chaveSubstituida?: string;
  demandaContratada?: number;
  scee?: {
    tpPartComp?: string;
    idAcessGer?: string;
    vPotInst?: number;
    tpFonteEnergia?: string;
    enerAloc?: number;
    vSaldAnt?: number;
    vCredExpirado?: number;
    vSaldAtual?: number;
    vCredExpirar?: number;
    CompetExpirar?: string;
  };
}

export const ITENS_PADRAO: ItemFixture[] = [
  {
    descricao: "Consumo Ativo TUSD",
    qtd: 1500,
    uMed: "2",
    vItem: 0.42,
    vProd: 630,
    medida: { tpGrMed: "03", uMed: "2", ant: 10000, atu: 11500 },
    icms: 113.4,
  },
  {
    descricao: "Consumo Ativo TE",
    qtd: 1500,
    uMed: "2",
    vItem: 0.3,
    vProd: 450,
    medida: { tpGrMed: "03", uMed: "2", ant: 10000, atu: 11500 },
    icms: 81,
  },
  { descricao: "Adicional Bandeira Amarela", qtd: 1500, uMed: "2", vItem: 0.02, vProd: 30 },
  { descricao: "Contrib. Ilum. Publica Municipal", vProd: 45.5 },
  { descricao: "Desconto Irrigante TUSD", vProd: 40, devolucao: true },
];

export function gerarNF3e(o: OpcoesNF3e = {}): string {
  const numero = o.numero ?? 1001;
  const chave = gerarChave(numero);
  const itens = o.itens ?? ITENS_PADRAO;
  const vNF =
    o.vNF ??
    Math.round(itens.reduce((s, i) => s + (i.devolucao ? -i.vProd : i.vProd), 0) * 100) / 100;

  const dets = itens
    .map((it, idx) => {
      const medida = it.medida
        ? `<gMedicao><nMed>1</nMed><gMedida><tpGrMed>${it.medida.tpGrMed}</tpGrMed><cPosTarif>0</cPosTarif><uMed>${it.medida.uMed}</uMed><vMedAnt>${it.medida.ant}</vMedAnt><vMedAtu>${it.medida.atu}</vMedAtu><vConst>${it.medida.constante ?? 1}</vConst><vMed>${(it.medida.atu - it.medida.ant) * (it.medida.constante ?? 1)}</vMed></gMedida></gMedicao>`
        : "";
      const icms =
        it.icms != null
          ? `<ICMS00><CST>00</CST><vBC>${it.vProd}</vBC><pICMS>18.00</pICMS><vICMS>${it.icms}</vICMS></ICMS00>`
          : `<ICMS40><CST>40</CST></ICMS40>`;
      return `<det nItem="${idx + 1}"><detItem>
        <gTarif><dIniTarif>2025-04-22</dIniTarif><dFimTarif>2026-04-21</dFimTarif><tpAto>1</tpAto><nAto>3400</nAto><anoAto>2025</anoAto><tpTarif>1</tpTarif><cPosTarif>${it.cPosTarif ?? "0"}</cPosTarif><uMed>${it.uMed ?? "2"}</uMed><vTarifHom>${it.vItem ?? 0}</vTarifHom><vTarifAplic>${it.vItem ?? 0}</vTarifAplic></gTarif>
        <prod><indOrigemQtd>1</indOrigemQtd>${medida}<cProd>${100 + idx}</cProd><xProd>${it.descricao}</xProd><cClass>${it.cClass ?? "0100101"}</cClass><CFOP>5258</CFOP>${it.uMed ? `<uMed>${it.uMed}</uMed>` : ""}${it.qtd != null ? `<qFaturada>${it.qtd}</qFaturada>` : ""}${it.vItem != null ? `<vItem>${it.vItem}</vItem>` : ""}<vProd>${it.vProd.toFixed(2)}</vProd>${it.devolucao ? "<indDevolucao>1</indDevolucao>" : ""}</prod>
        <imposto>${icms}<PIS><CST>01</CST><vBC>${it.vProd}</vBC><pPIS>0.65</pPIS><vPIS>0</vPIS></PIS><COFINS><CST>01</CST><vBC>${it.vProd}</vBC><pCOFINS>3.00</pCOFINS><vCOFINS>0</vCOFINS></COFINS></imposto>
      </detItem></det>`;
    })
    .join("\n");

  const nf3e = `<NF3e xmlns="http://www.portalfiscal.inf.br/nf3e">
  <infNF3e versao="1.00" Id="NF3e${chave}">
    <ide><cUF>35</cUF><tpAmb>1</tpAmb><mod>66</mod><serie>1</serie><nNF>${numero}</nNF><cNF>${String(numero).padStart(7, "0")}</cNF><cDV>${chave.slice(-1)}</cDV><dhEmi>${o.dhEmi ?? "2026-02-05T10:15:00-03:00"}</dhEmi><tpEmis>1</tpEmis><nSiteAutoriz>0</nSiteAutoriz><cMunFG>3550308</cMunFG><finNF3e>${o.finNF3e ?? "1"}</finNF3e><verProc>1.0</verProc></ide>
    <emit><CNPJ>02341467000120</CNPJ><IE>110000000000</IE><xNome>DISTRIBUIDORA DE ENERGIA TESTE S.A.</xNome><enderEmit><xLgr>Av. Central</xLgr><nro>100</nro><xBairro>Centro</xBairro><cMun>3550308</cMun><xMun>Sao Paulo</xMun><CEP>01000000</CEP><UF>SP</UF></enderEmit></emit>
    <dest><xNome>AGROPECUARIA BOA VISTA LTDA</xNome><CNPJ>${o.cnpjDest ?? "11222333000181"}</CNPJ><indIEDest>9</indIEDest><enderDest><xLgr>Estrada Municipal km 12</xLgr><nro>S/N</nro><xBairro>Zona Rural</xBairro><cMun>3501608</cMun><xMun>Americana</xMun><CEP>13470000</CEP><UF>SP</UF></enderDest></dest>
    ${o.uc === null ? "" : `<acessante><idAcesso>${o.uc ?? "000123456"}</idAcesso><idCodCliente>998877</idCodCliente><tpAcesso>0</tpAcesso><xNomeUC>Fazenda Boa Vista - Pivo 1</xNomeUC><tpClasse>07</tpClasse><tpSubClasse>71</tpSubClasse><tpFase>3</tpFase><tpGrpTensao>05</tpGrpTensao><tpModTar>01</tpModTar></acessante>`}
    ${o.chaveSubstituida ? `<gSub><chNF3e>${o.chaveSubstituida}</chNF3e><motSub>01</motSub></gSub>` : ""}
    ${o.demandaContratada != null ? `<gGrContrat nContrat="1"><tpGrContrat>1</tpGrContrat><tpPosTar>0</tpPosTar><qUnidContrat>${o.demandaContratada}</qUnidContrat></gGrContrat>` : ""}
    ${
      o.scee
        ? `<gSCEE><tpPartComp>${o.scee.tpPartComp ?? "1"}</tpPartComp><gConsumidor><idAcessGer>${o.scee.idAcessGer ?? "000123456"}</idAcessGer><vPotInst>${o.scee.vPotInst ?? 75}</vPotInst><tpFonteEnergia>${o.scee.tpFonteEnergia ?? "2"}</tpFonteEnergia><enerAloc>${o.scee.enerAloc ?? 0}</enerAloc><tpPosTar>0</tpPosTar></gConsumidor><gSaldoCred><tpPosTar>0</tpPosTar><vSaldAnt>${o.scee.vSaldAnt ?? 0}</vSaldAnt><vCredExpirado>${o.scee.vCredExpirado ?? 0}</vCredExpirado><vSaldAtual>${o.scee.vSaldAtual ?? 0}</vSaldAtual><vCredExpirar>${o.scee.vCredExpirar ?? 0}</vCredExpirar>${o.scee.CompetExpirar ? `<CompetExpirar>${o.scee.CompetExpirar}</CompetExpirar>` : ""}</gSaldoCred></gSCEE>`
        : ""
    }
    <gMed nMed="1"><idMedidor>MED123</idMedidor><dMedAnt>${o.dMedAnt ?? "2026-01-03"}</dMedAnt><dMedAtu>${o.dMedAtu ?? "2026-02-02"}</dMedAtu></gMed>
    <NFdet>
      ${dets}
    </NFdet>
    <total><vProd>${vNF.toFixed(2)}</vProd><ICMSTot><vBC>1080.00</vBC><vICMS>${(o.vICMS ?? 194.4).toFixed(2)}</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST></ICMSTot><vCOFINS>${(o.vCOFINS ?? 32.4).toFixed(2)}</vCOFINS><vCOFINSEfet>0.00</vCOFINSEfet><vPIS>${(o.vPIS ?? 7.02).toFixed(2)}</vPIS><vPISEfet>0.00</vPISEfet><vNF>${vNF.toFixed(2)}</vNF></total>
    <gFat>${o.competencia === null ? "" : `<CompetFat>${o.competencia ?? "202601"}</CompetFat>`}<dVencFat>${o.dVenc ?? "2026-02-20"}</dVencFat><dApresFat>2026-02-05</dApresFat><dProxLeitura>2026-03-04</dProxLeitura><codBarras>8360000000000000000000000000000000000000000000</codBarras></gFat>
    <infAdic><infCpl>Fatura de teste</infCpl></infAdic>
  </infNF3e>
  <infNF3eSupl><qrCodNF3e>https://exemplo</qrCodNF3e></infNF3eSupl>
  <Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo/><SignatureValue>abc</SignatureValue></Signature>
</NF3e>`;

  if (o.protocolo === false) return `<?xml version="1.0" encoding="UTF-8"?>\n${nf3e}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<nf3eProc versao="1.00" xmlns="http://www.portalfiscal.inf.br/nf3e">
${nf3e}
<protNF3e versao="1.00"><infProt><tpAmb>1</tpAmb><verAplic>SP-1.0</verAplic><chNF3e>${chave}</chNF3e><dhRecbto>2026-02-05T10:16:00-03:00</dhRecbto><nProt>135260000012345</nProt><digVal>abc=</digVal><cStat>${o.cStat ?? "100"}</cStat><xMotivo>Autorizado o uso da NF3e</xMotivo></infProt></protNF3e>
</nf3eProc>`;
}

export function gerarEventoCancelamento(chave: string, comRetorno = true): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<procEventoNF3e versao="1.00" xmlns="http://www.portalfiscal.inf.br/nf3e">
  <eventoNF3e versao="1.00"><infEvento Id="ID110111${chave}01"><cOrgao>35</cOrgao><tpAmb>1</tpAmb><CNPJ>02341467000120</CNPJ><chNF3e>${chave}</chNF3e><dhEvento>2026-02-06T09:00:00-03:00</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><detEvento versaoEvento="1.00"><evCancNF3e><descEvento>Cancelamento</descEvento><nProt>135260000012345</nProt><xJust>Erro de leitura do medidor</xJust></evCancNF3e></detEvento></infEvento></eventoNF3e>
  ${comRetorno ? `<retEventoNF3e versao="1.00"><infEvento><tpAmb>1</tpAmb><cOrgao>35</cOrgao><cStat>135</cStat><xMotivo>Evento registrado e vinculado a NF3e</xMotivo><chNF3e>${chave}</chNF3e><tpEvento>110111</tpEvento><nProt>135260000099999</nProt></infEvento></retEventoNF3e>` : ""}
</procEventoNF3e>`;
}
