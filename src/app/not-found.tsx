import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="result">
      <div className="trophy">🐯</div>
      <h1>Страница не найдена</h1>
      <Link className="btn block" href="/">На главную</Link>
    </div>
  );
}
