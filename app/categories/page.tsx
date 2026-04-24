export default function Categories() {
  const categories = ["Politics", "Business", "Tech", "Sports", "Entertainment"];

  return (
    <main>
      <h1>Categories</h1>
      <div style={{ marginTop: "20px", display: "grid", gap: "12px" }}>
        {categories.map((category) => (
          <div
            key={category}
            style={{
              border: "1px solid #ddd",
              padding: "16px",
              borderRadius: "8px",
            }}
          >
            {category}
          </div>
        ))}
      </div>
    </main>
  );
}