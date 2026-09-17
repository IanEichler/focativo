import { z } from "zod";

export const emailSchema = z
  .string({ message: "Informe o e-mail." })
  .trim()
  .toLowerCase()
  .min(1, "Informe o e-mail.")
  .max(320, "E-mail muito longo.")
  .pipe(z.email({ message: "E-mail inválido." }));

/** Mesma política configurada no Supabase Auth (mín. 8, letras e números). */
export const passwordSchema = z
  .string({ message: "Informe a senha." })
  .min(8, "A senha deve ter pelo menos 8 caracteres.")
  .max(72, "A senha deve ter no máximo 72 caracteres.")
  .regex(/[A-Za-z]/, "A senha deve conter letras.")
  .regex(/[0-9]/, "A senha deve conter números.");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha.").max(72),
  next: z.string().max(2048).optional(),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Informe seu nome.").max(120, "Nome muito longo."),
  email: emailSchema,
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não conferem.",
    path: ["confirmPassword"],
  });

export type SignInField = keyof z.infer<typeof signInSchema>;
export type SignUpField = keyof z.infer<typeof signUpSchema>;
export type ResetPasswordField = "password" | "confirmPassword";
