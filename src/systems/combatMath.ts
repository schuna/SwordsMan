export interface DamageCalcInput {
  attackPower: number;
  skillMultiplier: number;
  consumedQi: number;
  targetDefense: number;
  critChance: number;
  critMult: number;
  isGroggy: boolean;
  groggyMult: number;
}

export interface DamageCalcResult {
  finalDamage: number;
  isCrit: boolean;
}

export function computeDamage(input: DamageCalcInput): DamageCalcResult {
  const baseDamage = input.attackPower * input.skillMultiplier + input.consumedQi * 1.35;
  const defenseMitigation = 100 / (100 + Math.max(0, input.targetDefense));
  const isCrit = Math.random() < input.critChance;
  const critFactor = isCrit ? input.critMult : 1.0;
  const groggyFactor = input.isGroggy ? input.groggyMult : 1.0;
  const variance = 0.92 + Math.random() * 0.16;

  const finalDamage = Math.max(
    1,
    Math.floor(baseDamage * defenseMitigation * critFactor * groggyFactor * variance)
  );
  return { finalDamage, isCrit };
}
