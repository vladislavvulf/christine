// Генерирует иллюстрированных персонажей для мини-сцен (стиль Avataaars by Pablo Stanley, свободная лицензия)
// node scripts/gen-avatars.mjs  →  public/img/cast/<id>.svg
import { mkdirSync, writeFileSync } from 'node:fs';
import { createAvatar } from '@dicebear/core';
import { avataaars } from '@dicebear/collection';

const SKIN = ['edb98a', 'f8d25c', 'fd9841', 'ffdbb4'];
const HAIR = { black: '2c1b18', brown: '4a312c', auburn: 'a55728', blonde: 'b58143', gray: 'e8e1e1', pink: 'f59797' };
const base = { backgroundColor: ['transparent'], skinColor: [SKIN[3]], accessoriesProbability: 0, facialHairProbability: 0 };

const CAST = {
  'd1-m': { top: ['shortFlat'], hairColor: [HAIR.black], clothing: ['hoodie'], clothesColor: ['5199e4'], mouth: ['smile'], eyes: ['happy'] },
  'd1-f': { top: ['longButNotTooLong'], hairColor: [HAIR.brown], clothing: ['shirtScoopNeck'], clothesColor: ['ff488e'], mouth: ['twinkle'], eyes: ['default'] },
  'd2-f': { top: ['straight01'], hairColor: [HAIR.black], clothing: ['collarAndSweater'], clothesColor: ['65c9ff'], mouth: ['sad'], eyes: ['cry'], eyebrows: ['sadConcernedNatural'] },
  'd2-m': { top: ['shortWaved'], hairColor: [HAIR.black], clothing: ['blazerAndShirt'], clothesColor: ['262e33'], mouth: ['serious'], eyes: ['side'] },
  'd3-s': { top: ['hat'], hatColor: ['262e33'], hairColor: [HAIR.black], clothing: ['collarAndSweater'], clothesColor: ['929598'], facialHair: ['beardMedium'], facialHairProbability: 100, facialHairColor: [HAIR.gray], mouth: ['screamOpen'], eyes: ['surprised'] },
  'd3-k': { top: ['hat'], hatColor: ['262e33'], hairColor: [HAIR.black], clothing: ['blazerAndSweater'], clothesColor: ['e6b422'], facialHair: ['beardMajestic'], facialHairProbability: 100, facialHairColor: [HAIR.black], mouth: ['serious'], eyes: ['default'], eyebrows: ['angryNatural'] },
  'd4-h': { top: ['bob'], hairColor: [HAIR.brown], clothing: ['overall'], clothesColor: ['a7ffc4'], mouth: ['smile'], eyes: ['happy'] },
  'd4-d': { top: ['shortCurly'], hairColor: [HAIR.black], clothing: ['shirtCrewNeck'], clothesColor: ['25557c'], mouth: ['default'], eyes: ['default'] },
  'd5-m': { top: ['curvy'], hairColor: [HAIR.auburn], clothing: ['shirtVNeck'], clothesColor: ['ffafb9'], mouth: ['concerned'], eyes: ['default'], eyebrows: ['raisedExcitedNatural'] },
  'd5-s': { top: ['shaggy'], hairColor: [HAIR.black], clothing: ['graphicShirt'], clothesColor: ['ffffb1'], mouth: ['eating'], eyes: ['hearts'] },
  'd6-d': { top: ['winterHat02'], hatColor: ['3c4f5c'], hairColor: [HAIR.black], clothing: ['blazerAndShirt'], clothesColor: ['3c4f5c'], mouth: ['serious'], eyes: ['squint'], eyebrows: ['angryNatural'] },
  'd6-x': { top: ['shortFlat'], hairColor: [HAIR.black], clothing: ['hoodie'], clothesColor: ['262e33'], accessories: ['sunglasses'], accessoriesProbability: 100, mouth: ['grimace'], eyes: ['side'] },
  'd7-p': { top: ['froBand'], hairColor: [HAIR.black], clothing: ['shirtCrewNeck'], clothesColor: ['ff5c5c'], mouth: ['grimace'], eyes: ['squint'] },
  'd7-c': { top: ['winterHat03'], hatColor: ['25557c'], hairColor: [HAIR.black], clothing: ['collarAndSweater'], clothesColor: ['3c4f5c'], facialHair: ['moustacheFancy'], facialHairProbability: 100, facialHairColor: [HAIR.black], mouth: ['default'], eyes: ['default'] },
  'd7-f': { top: ['curly'], hairColor: [HAIR.pink], clothing: ['hoodie'], clothesColor: ['ff488e'], mouth: ['smile'], eyes: ['winkWacky'] },
  'd8-s': { top: ['miaWallace'], hairColor: [HAIR.black], clothing: ['shirtScoopNeck'], clothesColor: ['e6e6e6'], mouth: ['twinkle'], eyes: ['happy'] },
  'd8-o': { top: ['theCaesarAndSidePart'], hairColor: [HAIR.brown], clothing: ['blazerAndSweater'], clothesColor: ['b1e2ff'], accessories: ['round'], accessoriesProbability: 100, mouth: ['smile'], eyes: ['hearts'] },
};

mkdirSync('public/img/cast', { recursive: true });
for (const [id, opts] of Object.entries(CAST)) {
  const svg = createAvatar(avataaars, { seed: id, ...base, ...opts }).toString();
  writeFileSync(`public/img/cast/${id}.svg`, svg);
}
console.log(`✓ персонажей: ${Object.keys(CAST).length}`);
