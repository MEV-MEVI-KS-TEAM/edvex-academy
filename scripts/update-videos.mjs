import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import https from 'https'
import { config } from 'dotenv'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// La llave se lee de .env.local (nunca va en el código). Sin ella, el script aborta.
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY
if (!YOUTUBE_API_KEY) {
  console.error('❌ YOUTUBE_API_KEY no encontrada en .env.local (los videos ya son de Bunny; este script es de una sola vez)')
  process.exit(1)
}
const DELAY_MS = 200

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function youtubeSearch(query) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: 3,
      relevanceLanguage: 'es',
      videoDuration: 'medium',
      key: YOUTUBE_API_KEY
    })
    const url = `https://www.googleapis.com/youtube/v3/search?${params}`
    https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        const json = JSON.parse(data)
        // Llave inválida o borrada: abortar todo, no seguir «sin resultados».
        if (json.error) {
          console.error(`❌ YouTube Data API respondió ${json.error.code}: ${json.error.message}`)
          process.exit(1)
        }
        resolve(json)
      })
    }).on('error', reject)
  })
}

async function main() {
  console.log('Obteniendo semanas de Supabase...')

  const { data: semanas, error } = await supabase
    .from('semanas')
    .select(`
      id,
      numero,
      titulo,
      titulo_en,
      materia:materias(nombre, nombre_en)
    `)
    .order('numero')

  if (error) {
    console.error('Error:', error)
    process.exit(1)
  }

  console.log(`Total semanas: ${semanas.length}`)

  const sqlLines = []
  sqlLines.push('-- Videos actualizados con YouTube Data API v3')
  sqlLines.push('-- Generado: ' + new Date().toISOString())
  sqlLines.push('')

  for (let i = 0; i < semanas.length; i++) {
    const semana = semanas[i]
    const materiaNombre = semana.materia?.nombre || ''
    const query = `${materiaNombre} ${semana.titulo} explicación bachillerato`

    console.log(`[${i+1}/${semanas.length}] Buscando: ${query}`)

    try {
      const result = await youtubeSearch(query)

      if (!result.items || result.items.length === 0) {
        console.log('  Sin resultados, saltando...')
        continue
      }

      const videos = result.items.slice(0, 3).map(item => ({
        titulo: item.snippet.title.replace(/'/g, "''"),
        titulo_en: item.snippet.title.replace(/'/g, "''"),
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        url_en: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        duracion: '10 min'
      }))

      const videosJson = JSON.stringify(videos).replace(/'/g, "''")

      sqlLines.push(`UPDATE semanas SET videos = '${videosJson}'::jsonb`)
      sqlLines.push(`WHERE id = '${semana.id}';`)
      sqlLines.push('')

      console.log(`  ✓ ${videos.length} videos encontrados`)

    } catch (err) {
      console.error(`  Error en semana ${semana.id}:`, err.message)
    }

    await sleep(DELAY_MS)
  }

  const sqlContent = sqlLines.join('\n')
  fs.writeFileSync('scripts/videos-update.sql', sqlContent)
  console.log('\n✅ SQL generado en scripts/videos-update.sql')
  console.log(`Total líneas: ${sqlLines.length}`)
}

main()
