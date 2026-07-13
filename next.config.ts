import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fixa a raiz do Turbopack neste projeto: sem isso, o Next detecta o
  // package-lock.json da pasta pai (usado só pela CLI do Supabase) e
  // confunde a raiz do workspace, o que pode quebrar a resolução de
  // módulos internos como o global-error.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
