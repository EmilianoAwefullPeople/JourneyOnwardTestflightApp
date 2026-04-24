/**
 * ISO 3166-1 alpha-2 to one of seven continents (no "Other" bucket).
 * Unlisted codes return null — callers omit those days from continent charts.
 */

export type SevenContinent =
  | 'North America'
  | 'South America'
  | 'Europe'
  | 'Africa'
  | 'Asia'
  | 'Oceania'
  | 'Antarctica';

/** Caribbean + Northern America + Central America (UN Americas minus South America). */
const ISO_NORTH_AMERICA = new Set(
  'AG AI AW BB BM BQ BS BZ CA CR CU CW DM DO GD GL GP GT HN HT JM KN KY LC MF MQ MS MX NI PA PM PR SV SX TC TT US VC VG VI UM BL AW'.split(/\s+/)
);

const ISO_SOUTH_AMERICA = new Set('AR BO BR CL CO EC FK GF GY PE PY SR UY VE'.split(/\s+/));

const ISO_EUROPE = new Set(
  'AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK IM AX SJ'
    .split(/\s+/)
    .filter(Boolean)
);

const ISO_AFRICA = new Set(
  'DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU YT MA MZ NA NE NG RW RE ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW SH'
    .split(/\s+/)
);

const ISO_ASIA = new Set(
  'AF AM AZ BH BD BT BN KH CN GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO MY MV MN MM NP OM PK PS PH QA SA SG KR LK SY TW TJ TH TM TR AE UZ VN YE TL KP'.split(/\s+/)
);

const ISO_OCEANIA = new Set(
  'AU CK FJ PF GU KI MH FM NR NC NZ NU PW PG PN WS SB TK TO TV VU WF AS MP'.split(/\s+/)
);

const ISO_ANTARCTICA = new Set('AQ BV TF HM GS'.split(/\s+/));

export function continentFromIso(iso: string): SevenContinent | null {
  const u = iso.trim().toUpperCase();
  if (!u || u.length !== 2) return null;
  if (ISO_ANTARCTICA.has(u)) return 'Antarctica';
  if (ISO_NORTH_AMERICA.has(u)) return 'North America';
  if (ISO_SOUTH_AMERICA.has(u)) return 'South America';
  if (ISO_EUROPE.has(u)) return 'Europe';
  if (ISO_AFRICA.has(u)) return 'Africa';
  if (ISO_ASIA.has(u)) return 'Asia';
  if (ISO_OCEANIA.has(u)) return 'Oceania';
  return null;
}
