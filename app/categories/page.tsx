import { CATEGORY_OPTIONS, getCategoryLabel } from "../../lib/categories";

export default function Categories() {
  return (
    <main>
      <h1>Categories</h1>
      <div style={{ marginTop: "20px", display: "grid", gap: "12px" }}>
        {CATEGORY_OPTIONS.map((category) => (
          <div
            key={category}
            style={{
              border: "1px solid #ddd",
              padding: "16px",
              borderRadius: "8px",
            }}
          >
            {getCategoryLabel(category)}
          </div>
        ))}
      </div>
    </main>
  );
}
