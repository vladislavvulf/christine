import GameScreen from '@/components/GameScreen';
import { GAME_IDS } from '@/lib/games-meta';
export const dynamicParams = false;
export function generateStaticParams() { return GAME_IDS.map(id => ({ id })); }
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GameScreen id={id} />;
}
