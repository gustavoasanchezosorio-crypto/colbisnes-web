#!/bin/bash

# ============================================================
#  COLBISNES - Script de migración a PostgreSQL (Neon)
#  Uso: bash migrar.sh
# ============================================================

set -e  # Detener si cualquier comando falla

AZUL='\033[0;34m'
VERDE='\033[0;32m'
ROJO='\033[0;31m'
AMARILLO='\033[1;33m'
NC='\033[0m' # Sin color

echo ""
echo -e "${AZUL}╔══════════════════════════════════════════════╗${NC}"
echo -e "${AZUL}║   COLBISNES — Migración a PostgreSQL/Neon    ║${NC}"
echo -e "${AZUL}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── PASO 0: Verificar que estamos en la carpeta correcta ──────────────────────
if [ ! -f "package.json" ]; then
  echo -e "${ROJO}❌ Error: Ejecuta este script desde la raíz de tu proyecto colbisnes-web${NC}"
  echo -e "   Ejemplo: cd ~/colbisnes-web && bash migrar.sh"
  exit 1
fi

if ! grep -q "colbisnes-web" package.json; then
  echo -e "${ROJO}❌ Error: Este no parece ser el proyecto colbisnes-web${NC}"
  exit 1
fi

echo -e "${VERDE}✅ Proyecto colbisnes-web detectado${NC}"
echo ""

# ── PASO 1: Pedir el DATABASE_URL ─────────────────────────────────────────────
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${AMARILLO}  PASO 1: Configura tu base de datos en Neon${NC}"
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  1. Ve a https://neon.tech y crea una cuenta gratis"
echo "  2. Crea un proyecto llamado: colbisnes"
echo "  3. Copia el 'Connection string' (empieza con postgresql://...)"
echo ""
echo -e "${AZUL}Pega aquí tu Connection string de Neon y presiona Enter:${NC}"
read -r DATABASE_URL

if [ -z "$DATABASE_URL" ]; then
  echo -e "${ROJO}❌ No pegaste ningún URL. Vuelve a ejecutar el script.${NC}"
  exit 1
fi

if [[ "$DATABASE_URL" != postgresql://* ]]; then
  echo -e "${ROJO}❌ El URL no parece válido. Debe empezar con postgresql://${NC}"
  exit 1
fi

# Agregar sslmode si no está
if [[ "$DATABASE_URL" != *"sslmode"* ]]; then
  if [[ "$DATABASE_URL" == *"?"* ]]; then
    DATABASE_URL="${DATABASE_URL}&sslmode=require"
  else
    DATABASE_URL="${DATABASE_URL}?sslmode=require"
  fi
fi

echo ""
echo -e "${VERDE}✅ URL válido detectado${NC}"

# ── PASO 2: Actualizar .env ───────────────────────────────────────────────────
echo ""
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${AMARILLO}  PASO 2: Actualizando .env${NC}"
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Backup del .env original
if [ -f ".env" ]; then
  cp .env .env.backup
  echo -e "${VERDE}✅ Backup de .env guardado como .env.backup${NC}"
fi

# Eliminar líneas viejas de DATABASE_URL si existen
if [ -f ".env" ]; then
  # Eliminar líneas existentes de DATABASE_URL y DIRECT_URL
  grep -v "^DATABASE_URL=" .env | grep -v "^DIRECT_URL=" > .env.tmp && mv .env.tmp .env
fi

# Agregar las nuevas variables
echo "" >> .env
echo "# Base de datos PostgreSQL (Neon) — agregado por migrar.sh" >> .env
echo "DATABASE_URL=\"${DATABASE_URL}\"" >> .env
echo "DIRECT_URL=\"${DATABASE_URL}\"" >> .env

echo -e "${VERDE}✅ .env actualizado con PostgreSQL${NC}"

# ── PASO 3: Actualizar prisma/schema.prisma ───────────────────────────────────
echo ""
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${AMARILLO}  PASO 3: Actualizando prisma/schema.prisma${NC}"
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ ! -f "prisma/schema.prisma" ]; then
  echo -e "${ROJO}❌ No se encontró prisma/schema.prisma${NC}"
  exit 1
fi

# Backup del schema
cp prisma/schema.prisma prisma/schema.prisma.backup
echo -e "${VERDE}✅ Backup guardado como prisma/schema.prisma.backup${NC}"

# Reemplazar el bloque datasource de sqlite a postgresql
python3 - <<'PYEOF'
import re

with open('prisma/schema.prisma', 'r') as f:
    content = f.read()

# Nuevo bloque generator + datasource
new_header = '''generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}'''

# Reemplazar el bloque generator y datasource existente
# Patrón que captura desde generator hasta el cierre de datasource
pattern = r'generator client \{[^}]+\}\s*datasource db \{[^}]+\}'
result = re.sub(pattern, new_header, content, flags=re.DOTALL)

# Si el patrón no funcionó (estructura diferente), intentar solo datasource
if result == content:
    pattern2 = r'datasource db \{[^}]+\}'
    new_datasource = '''datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}'''
    result = re.sub(pattern2, new_datasource, content, flags=re.DOTALL)

with open('prisma/schema.prisma', 'w') as f:
    f.write(result)

print("Schema actualizado")
PYEOF

echo -e "${VERDE}✅ prisma/schema.prisma actualizado a PostgreSQL${NC}"

# ── PASO 4: Actualizar next.config.ts ────────────────────────────────────────
echo ""
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${AMARILLO}  PASO 4: Actualizando next.config.ts${NC}"
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ -f "next.config.ts" ]; then
  cp next.config.ts next.config.ts.backup

  cat > next.config.ts << 'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.externals = [...(config.externals || []), "pg-native"];
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "*.neon.tech",
      },
    ],
  },
};

export default nextConfig;
EOF

  echo -e "${VERDE}✅ next.config.ts actualizado${NC}"
elif [ -f "next.config.js" ]; then
  cp next.config.js next.config.js.backup

  cat > next.config.js << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.externals = [...(config.externals || []), "pg-native"];
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
};

module.exports = nextConfig;
EOF

  echo -e "${VERDE}✅ next.config.js actualizado${NC}"
fi

# ── PASO 5: Instalar dependencias ─────────────────────────────────────────────
echo ""
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${AMARILLO}  PASO 5: Instalando dependencias de PostgreSQL${NC}"
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

npm install @neondatabase/serverless pg 2>&1 | tail -5
npm install -D @types/pg 2>&1 | tail -3

echo -e "${VERDE}✅ Dependencias instaladas${NC}"

# ── PASO 6: Migrar schema a Neon ──────────────────────────────────────────────
echo ""
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${AMARILLO}  PASO 6: Creando tablas en PostgreSQL (Neon)${NC}"
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo "  Esto puede tomar 30-60 segundos..."
echo ""

npx prisma migrate dev --name migrar-a-postgresql --skip-seed 2>&1

echo ""
echo -e "${VERDE}✅ Tablas creadas en PostgreSQL${NC}"

# ── PASO 7: Generar cliente Prisma ────────────────────────────────────────────
echo ""
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${AMARILLO}  PASO 7: Generando cliente Prisma${NC}"
echo -e "${AMARILLO}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

npx prisma generate 2>&1 | tail -5

echo -e "${VERDE}✅ Cliente Prisma generado${NC}"

# ── ÉXITO ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${VERDE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${VERDE}║   ✅ MIGRACIÓN COMPLETADA EXITOSAMENTE       ║${NC}"
echo -e "${VERDE}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo "  Backups guardados:"
echo "    • .env.backup"
echo "    • prisma/schema.prisma.backup"
echo ""
echo "  Próximos pasos:"
echo "    1. Ejecuta:  npm run dev"
echo "    2. Abre:     http://localhost:3006"
echo "    3. Verifica que puedes registrarte y publicar productos"
echo "    4. (Opcional) Verifica tablas: npx prisma studio"
echo ""
echo -e "${AZUL}  Tu app ahora usa PostgreSQL en la nube (Neon) 🚀${NC}"
echo ""
