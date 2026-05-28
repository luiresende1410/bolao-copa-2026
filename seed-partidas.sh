#!/bin/bash
# Script para importar todos os jogos da fase de grupos da Copa 2026
# Uso: bash seed-partidas.sh [API_URL]
# Exemplo: bash seed-partidas.sh http://localhost:3000

API=${1:-http://localhost:3000}

echo "=== Importando jogos da Copa 2026 ==="
echo "API: $API"
echo ""

# Funcao para criar partida
criar_partida() {
  local mandante="$1"
  local visitante="$2"
  local data="$3"
  local local_jogo="$4"
  local fase="$5"
  
  curl -s -X POST "$API/api/v1/bolao/partidas" \
    -H "Content-Type: application/json" \
    -d "{\"selecaoMandante\":\"$mandante\",\"selecaoVisitante\":\"$visitante\",\"dataHorario\":\"$data\",\"local\":\"$local_jogo\",\"faseTorneio\":\"$fase\"}" > /dev/null 2>&1
  
  if [ $? -eq 0 ]; then
    echo "  + $mandante vs $visitante ($data)"
  else
    echo "  ! ERRO: $mandante vs $visitante"
  fi
}

# === GRUPO A: Marrocos, Brasil, Colombia, Paraguai ===
echo "--- Grupo A ---"
criar_partida "Marrocos" "Brasil" "2026-06-11T21:00:00Z" "Estadio Azteca, Mexico" "fase_de_grupos"
criar_partida "Colombia" "Paraguai" "2026-06-12T00:00:00Z" "Estadio Azteca, Mexico" "fase_de_grupos"
criar_partida "Brasil" "Paraguai" "2026-06-16T21:00:00Z" "Rose Bowl, Los Angeles" "fase_de_grupos"
criar_partida "Marrocos" "Colombia" "2026-06-16T18:00:00Z" "Rose Bowl, Los Angeles" "fase_de_grupos"
criar_partida "Paraguai" "Marrocos" "2026-06-21T18:00:00Z" "Estadio Azteca, Mexico" "fase_de_grupos"
criar_partida "Brasil" "Colombia" "2026-06-21T18:00:00Z" "Rose Bowl, Los Angeles" "fase_de_grupos"

# === GRUPO B: EUA, Mexico, Equador, Bolivia ===
echo "--- Grupo B ---"
criar_partida "EUA" "Bolivia" "2026-06-12T18:00:00Z" "SoFi Stadium, Los Angeles" "fase_de_grupos"
criar_partida "Mexico" "Equador" "2026-06-12T21:00:00Z" "Estadio Jalisco, Guadalajara" "fase_de_grupos"
criar_partida "EUA" "Equador" "2026-06-17T18:00:00Z" "MetLife Stadium, New Jersey" "fase_de_grupos"
criar_partida "Mexico" "Bolivia" "2026-06-17T21:00:00Z" "Estadio Jalisco, Guadalajara" "fase_de_grupos"
criar_partida "Equador" "Bolivia" "2026-06-22T18:00:00Z" "SoFi Stadium, Los Angeles" "fase_de_grupos"
criar_partida "EUA" "Mexico" "2026-06-22T18:00:00Z" "MetLife Stadium, New Jersey" "fase_de_grupos"

# === GRUPO C: Argentina, Franca, Iraque, Peru ===
echo "--- Grupo C ---"
criar_partida "Argentina" "Peru" "2026-06-13T18:00:00Z" "Hard Rock Stadium, Miami" "fase_de_grupos"
criar_partida "Franca" "Iraque" "2026-06-13T21:00:00Z" "Hard Rock Stadium, Miami" "fase_de_grupos"
criar_partida "Argentina" "Iraque" "2026-06-18T18:00:00Z" "Mercedes-Benz Stadium, Atlanta" "fase_de_grupos"
criar_partida "Peru" "Franca" "2026-06-18T21:00:00Z" "Mercedes-Benz Stadium, Atlanta" "fase_de_grupos"
criar_partida "Iraque" "Peru" "2026-06-23T18:00:00Z" "Hard Rock Stadium, Miami" "fase_de_grupos"
criar_partida "Argentina" "Franca" "2026-06-23T18:00:00Z" "Mercedes-Benz Stadium, Atlanta" "fase_de_grupos"

# === GRUPO D: Espanha, Holanda, Paraguai, Nova Zelandia ===
echo "--- Grupo D ---"
criar_partida "Espanha" "Nova Zelandia" "2026-06-14T18:00:00Z" "AT&T Stadium, Dallas" "fase_de_grupos"
criar_partida "Holanda" "Indonésia" "2026-06-14T21:00:00Z" "AT&T Stadium, Dallas" "fase_de_grupos"
criar_partida "Espanha" "Indonésia" "2026-06-19T18:00:00Z" "NRG Stadium, Houston" "fase_de_grupos"
criar_partida "Nova Zelandia" "Holanda" "2026-06-19T21:00:00Z" "NRG Stadium, Houston" "fase_de_grupos"
criar_partida "Indonésia" "Nova Zelandia" "2026-06-24T18:00:00Z" "AT&T Stadium, Dallas" "fase_de_grupos"
criar_partida "Holanda" "Espanha" "2026-06-24T18:00:00Z" "NRG Stadium, Houston" "fase_de_grupos"

# === GRUPO E: Inglaterra, Dinamarca, Servia, Paraguai ===
echo "--- Grupo E ---"
criar_partida "Inglaterra" "Servia" "2026-06-14T15:00:00Z" "Lincoln Financial Field, Philadelphia" "fase_de_grupos"
criar_partida "Dinamarca" "Paraguai" "2026-06-14T18:00:00Z" "Lincoln Financial Field, Philadelphia" "fase_de_grupos"
criar_partida "Inglaterra" "Paraguai" "2026-06-19T15:00:00Z" "Gillette Stadium, Boston" "fase_de_grupos"
criar_partida "Servia" "Dinamarca" "2026-06-19T18:00:00Z" "Gillette Stadium, Boston" "fase_de_grupos"
criar_partida "Paraguai" "Servia" "2026-06-24T15:00:00Z" "Lincoln Financial Field, Philadelphia" "fase_de_grupos"
criar_partida "Dinamarca" "Inglaterra" "2026-06-24T15:00:00Z" "Gillette Stadium, Boston" "fase_de_grupos"

# === GRUPO F: Alemanha, Japao, Coreia do Sul, Turquia ===
echo "--- Grupo F ---"
criar_partida "Alemanha" "Turquia" "2026-06-15T18:00:00Z" "Lincoln Financial Field, Philadelphia" "fase_de_grupos"
criar_partida "Japao" "Coreia do Sul" "2026-06-15T21:00:00Z" "BC Place, Vancouver" "fase_de_grupos"
criar_partida "Alemanha" "Coreia do Sul" "2026-06-20T18:00:00Z" "MetLife Stadium, New Jersey" "fase_de_grupos"
criar_partida "Turquia" "Japao" "2026-06-20T21:00:00Z" "BC Place, Vancouver" "fase_de_grupos"
criar_partida "Coreia do Sul" "Turquia" "2026-06-25T18:00:00Z" "Lincoln Financial Field, Philadelphia" "fase_de_grupos"
criar_partida "Japao" "Alemanha" "2026-06-25T18:00:00Z" "MetLife Stadium, New Jersey" "fase_de_grupos"

# === GRUPO G: Portugal, Belgica, Senegal, Canada ===
echo "--- Grupo G ---"
criar_partida "Canada" "Senegal" "2026-06-15T15:00:00Z" "BMO Field, Toronto" "fase_de_grupos"
criar_partida "Portugal" "Belgica" "2026-06-15T18:00:00Z" "BMO Field, Toronto" "fase_de_grupos"
criar_partida "Canada" "Belgica" "2026-06-20T15:00:00Z" "BMO Field, Toronto" "fase_de_grupos"
criar_partida "Senegal" "Portugal" "2026-06-20T18:00:00Z" "Lumen Field, Seattle" "fase_de_grupos"
criar_partida "Belgica" "Senegal" "2026-06-25T15:00:00Z" "BMO Field, Toronto" "fase_de_grupos"
criar_partida "Portugal" "Canada" "2026-06-25T15:00:00Z" "Lumen Field, Seattle" "fase_de_grupos"

# === GRUPO H: Italia, Australia, Egito, Ucrania ===
echo "--- Grupo H ---"
criar_partida "Italia" "Egito" "2026-06-16T18:00:00Z" "Levi's Stadium, San Francisco" "fase_de_grupos"
criar_partida "Australia" "Ucrania" "2026-06-16T21:00:00Z" "Levi's Stadium, San Francisco" "fase_de_grupos"
criar_partida "Italia" "Ucrania" "2026-06-21T18:00:00Z" "Levi's Stadium, San Francisco" "fase_de_grupos"
criar_partida "Egito" "Australia" "2026-06-21T21:00:00Z" "Lumen Field, Seattle" "fase_de_grupos"
criar_partida "Ucrania" "Egito" "2026-06-26T18:00:00Z" "Levi's Stadium, San Francisco" "fase_de_grupos"
criar_partida "Australia" "Italia" "2026-06-26T18:00:00Z" "Lumen Field, Seattle" "fase_de_grupos"

echo ""
echo "=== Importacao concluida! ==="
echo "Total: 48 jogos da fase de grupos"
echo ""
echo "Verifique: curl $API/api/v1/bolao/partidas | python3 -m json.tool | head -20"