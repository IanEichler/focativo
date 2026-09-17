"use client";

/** Último recurso: falha no layout raiz. Sem dependências de providers. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f7f8f7",
          color: "#171a17",
        }}
      >
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>Algo deu errado</h1>
          <p style={{ fontSize: 14, color: "#626762", margin: "0 0 16px" }}>
            Não foi possível carregar a aplicação. Tente novamente em instantes.
            {error.digest ? ` Código: ${error.digest}` : ""}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 10,
              border: "none",
              background: "#35744e",
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
