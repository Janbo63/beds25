import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Email whitelist — only these Google accounts can sign in
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      // If no whitelist configured, allow all (dev mode)
      if (ALLOWED_EMAILS.length === 0) return true;

      const email = user.email?.toLowerCase();
      if (!email) return false;

      return ALLOWED_EMAILS.includes(email);
    },
    async session({ session }) {
      return session;
    },
  },
});
