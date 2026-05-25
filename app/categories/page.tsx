import { CATEGORY_OPTIONS, getCategoryImageUrl, getCategoryLabel } from "../../lib/categories";

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
              display: "grid",
              gap: "10px",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                width: "100%",
                aspectRatio: "16 / 9",
                borderRadius: "12px",
                backgroundImage: getCategoryImageUrl(category)
                  ? `url(${getCategoryImageUrl(category)})`
                  : "linear-gradient(135deg, #dbeafe 0%, #f8fafc 100%)",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
            {getCategoryLabel(category)}
          </div>
        ))}
      </div>
    </main>
  );
}
