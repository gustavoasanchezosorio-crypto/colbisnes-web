'use client';

import React from 'react';
import { THEME } from '@/lib/theme';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ children, style, ...props }) => (
  <button
    {...props}
    style={{
      padding: "10px 24px",
      borderRadius: 30,
      border: "none",
      fontWeight: 700,
      cursor: "pointer",
      background: `linear-gradient(135deg, ${THEME.secondary}, ${THEME.secondaryLight})`,
      color: THEME.text,
      boxShadow: "0 6px 18px rgba(212,199,161,0.4)",
      transition: "all 0.2s",
      ...style,
    }}
  >
    {children}
  </button>
);

export const OutlineButton: React.FC<ButtonProps> = ({ children, style, ...props }) => (
  <button
    {...props}
    style={{
      padding: "10px 24px",
      borderRadius: 30,
      border: `1px solid ${THEME.primary}`,
      background: "transparent",
      color: THEME.primary,
      fontWeight: 600,
      cursor: "pointer",
      transition: "all 0.2s",
      ...style,
    }}
  >
    {children}
  </button>
);

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ style, error, ...props }, ref) => (
    <div style={{ width: "100%" }}>
      <input
        ref={ref}
        {...props}
        style={{
          width: "100%",
          padding: "12px",
          borderRadius: 12,
          border: `1px solid ${error ? THEME.error : THEME.border}`,
          fontSize: "0.95rem",
          transition: "all 0.2s",
          outline: "none",
          ...style,
        }}
      />
      {error && <p style={{ margin: "4px 0 0 0", fontSize: "0.75rem", color: THEME.error }}>{error}</p>}
    </div>
  )
);
Input.displayName = 'Input';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode;
}

export const Select: React.FC<SelectProps> = ({ children, style, ...props }) => (
  <select
    {...props}
    style={{
      padding: "12px",
      borderRadius: 12,
      border: `1px solid ${THEME.border}`,
      background: "white",
      cursor: "pointer",
      fontSize: "0.95rem",
      ...style,
    }}
  >
    {children}
  </select>
);

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ style, error, ...props }, ref) => (
    <div style={{ width: "100%" }}>
      <textarea
        ref={ref}
        {...props}
        style={{
          width: "100%",
          padding: "12px",
          borderRadius: 12,
          border: `1px solid ${error ? THEME.error : THEME.border}`,
          fontSize: "0.95rem",
          resize: "vertical",
          ...style,
        }}
      />
      {error && <p style={{ margin: "4px 0 0 0", fontSize: "0.75rem", color: THEME.error }}>{error}</p>}
    </div>
  )
);
TextArea.displayName = 'TextArea';
