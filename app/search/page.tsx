export default function Search() {
  return (
    <main>
      <h1>Search</h1>
      <input
        type="text"
        placeholder="Search news..."
        style={{
          marginTop: "16px",
          padding: "12px",
          width: "100%",
          maxWidth: "500px",
          border: "1px solid #ccc",
          borderRadius: "8px",
        }}
      />
    </main>
  );
}