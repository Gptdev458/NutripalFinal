import { corsHeaders } from './cors.ts'

export const handleError = (error: any) => {
  console.error(error)
  const status = error.status || 500
  const message = error.message || 'An unexpected error occurred'
  
  return new Response(
    JSON.stringify({
      error: message,
      status: 'error'
    }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
}
