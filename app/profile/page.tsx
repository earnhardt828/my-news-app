"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type UserState = {
  id: string | null;
  email: string | null;
} | null;

type MyComment = {
  id: number;
  text: string;
  article_id: number;
  username: string | null;
};

const CATEGORY_OPTIONS = [
  "Business",
  "Tech",
  "Sports",
  "Politics",
  "Health",
  "Science",
  "Entertainment",
  "World",
];

export default function Profile() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [currentUser, setCurrentUser] = useState<UserState>(null);
  const [message, setMessage] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [myComments, setMyComments] = useState<MyComment[]>([]);

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      setCurrentUser({
        id: user?.id ?? null,
        email: user?.email ?? null,
      });

      if (!user?.id) {
        setUsername("");
        setAvatarUrl("");
        setCategories([]);
        setMyComments([]);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, categories, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      setUsername(profile?.username ?? "");
      setAvatarUrl(profile?.avatar_url ?? "");
      setCategories(profile?.categories ?? []);

      const { data: comments } = await supabase
        .from("comments")
        .select("id, text, article_id, username")
        .eq("user_id", user.id);

      setMyComments((comments ?? []) as MyComment[]);
    }

    loadUser();
  }, []);

  const loadProfileForUser = async (userId: string) => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, categories, avatar_url")
      .eq("id", userId)
      .maybeSingle();

    setUsername(profile?.username ?? "");
    setAvatarUrl(profile?.avatar_url ?? "");
    setCategories(profile?.categories ?? []);

    const { data: comments } = await supabase
      .from("comments")
      .select("id, text, article_id, username")
      .eq("user_id", userId);

    setMyComments((comments ?? []) as MyComment[]);
  };

  const handleSignUp = async () => {
    const { error } = await supabase.auth.signUp({ email, password });
    setMessage(error ? error.message : "Sign-up successful.");
  };

  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage(error.message);
      return;
    }

    const { data } = await supabase.auth.getUser();
    const user = data.user;

    setCurrentUser({
      id: user?.id ?? null,
      email: user?.email ?? null,
    });

    if (user?.id) {
      await loadProfileForUser(user.id);
    }

    setMessage("Signed in.");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setUsername("");
    setAvatarUrl("");
    setCategories([]);
    setMyComments([]);
    setMessage("Signed out.");
  };

  const handleSaveUsername = async () => {
    if (!currentUser?.id) {
      setMessage("Log in first.");
      return;
    }

    if (!username.trim()) {
      setMessage("Enter a username.");
      return;
    }

    const { error } = await supabase.from("profiles").upsert({
      id: currentUser.id,
      email: currentUser.email,
      username: username.trim(),
      categories,
      avatar_url: avatarUrl,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Username saved.");
  };

  return (
    <main style={{ maxWidth: "600px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "32px", fontWeight: "bold" }}>Profile</h1>

      <div
        style={{
          marginTop: "20px",
          display: "grid",
          gap: "12px",
          padding: "20px",
          border: "1px solid #ddd",
          borderRadius: "12px",
          backgroundColor: "white",
          color: "black",
        }}
      >
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: "12px", borderRadius: "8px" }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: "12px", borderRadius: "8px" }}
        />

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button onClick={handleSignUp}>Sign Up</button>
          <button onClick={handleSignIn}>Log In</button>
          <button onClick={handleSignOut}>Log Out</button>
        </div>

        <input
          type="text"
          placeholder="Choose a username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ padding: "12px", borderRadius: "8px" }}
        />

        <input
          type="text"
          placeholder="Profile picture URL"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          style={{
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid #ccc",
            color: "black",
            backgroundColor: "white",
          }}
        />

        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt="Profile"
            width={80}
            height={80}
            unoptimized
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "50%",
              objectFit: "cover",
            }}
          />
        ) : null}

        <div style={{ marginTop: "10px" }}>
          <strong>Select categories:</strong>

          <div style={{ marginTop: "8px" }}>
            {CATEGORY_OPTIONS.map((cat) => (
              <button
                key={cat}
                onClick={() =>
                  setCategories((prev) =>
                    prev.includes(cat)
                      ? prev.filter((current) => current !== cat)
                      : [...prev, cat]
                  )
                }
                style={{
                  margin: "5px",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #ccc",
                  backgroundColor: categories.includes(cat) ? "#ddd" : "white",
                  color: "black",
                  cursor: "pointer",
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <button onClick={handleSaveUsername}>Save Username</button>

        {message ? <p>{message}</p> : null}

        <p>
          <strong>Current user:</strong>{" "}
          {currentUser?.email ?? "Not signed in"}
        </p>

        <p>
          <strong>Username:</strong> {username || "None"}
        </p>

        <div style={{ marginTop: "20px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "bold" }}>My Comments</h2>

          <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
            {myComments.length === 0 ? (
              <p>No comments yet.</p>
            ) : (
              myComments.map((comment) => (
                <div
                  key={comment.id}
                  style={{
                    padding: "10px",
                    border: "1px solid #eee",
                    borderRadius: "8px",
                  }}
                >
                  {comment.text}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
