import { DramaRoute } from '@/components/DramaScreens';
import { DRAMAS } from '@/lib/data';
import { CLIPS } from '@/lib/clips';
export const dynamicParams = false;
export function generateStaticParams() { return [...CLIPS.map(c => ({ id: c.id })), ...DRAMAS.map(d => ({ id: d.id }))]; }
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DramaRoute id={id} />;
}
