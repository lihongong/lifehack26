export default function PlaceholderView({ title, description }) {
  return (
    <section className="placeholder" aria-labelledby="placeholder-title">
      <p className="eyebrow">COMING NEXT</p>
      <h1 id="placeholder-title">{title}</h1>
      <p>{description}</p>
    </section>
  );
}
