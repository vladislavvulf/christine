import LessonScreen from '@/components/LessonScreen';
import { ALL_LESSONS } from '@/lib/items';
export const dynamicParams = false;
export function generateStaticParams() { return ALL_LESSONS.map(l => ({ id: l.id })); }
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LessonScreen id={id} />;
}
