
export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    const respond = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8"
        }
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(
        `<!doctype html>
        <html lang="tr">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <meta charset="utf-8">
        <title>AskerGPT</title>
        <style>
          body{background:#0b1110;color:#eef8f1;font:16px Arial;
          max-width:600px;margin:30px auto;padding:18px}
          h1{color:#75e6a2}
          textarea{width:100%;height:110px;box-sizing:border-box;
          padding:12px;border-radius:10px;background:#18231e;
          color:white;border:1px solid #42604d;font-size:16px}
          button{margin-top:12px;padding:13px;width:100%;
          background:#75e6a2;border:0;border-radius:10px;
          font-weight:bold;font-size:16px}
          #answer{white-space:pre-wrap;background:#18231e;
          padding:14px;border-radius:10px;margin-top:16px}
        </style>
        <h1>🇹🇷 AskerGPT</h1>
        <p>SMS ile kullanılacak yapay zekânın ilk test sürümü.</p>
        <textarea id="q" maxlength="1000"
        placeholder="Sorunu yaz kanka..."></textarea>
        <button id="send">AskerGPT'ye sor</button>
        <div id="answer">Cevabın burada görünecek.</div>
        <script>
          const q=document.getElementById("q");
          const answer=document.getElementById("answer");
          document.getElementById("send").onclick=async()=>{
            const message=q.value.trim();
            if(!message){answer.textContent="Önce bir soru yaz.";return;}
            answer.textContent="AskerGPT düşünüyor...";
            try{
              const r=await fetch("/ask",{
                method:"POST",
                headers:{"Content-Type":"application/json"},
                body:JSON.stringify({message})
              });
              const d=await r.json();
              answer.textContent=d.reply||d.error||"Yanıt alınamadı.";
            }catch(e){
              answer.textContent="Bağlantı hatası. Tekrar dene.";
            }
          };
        </script></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    if (request.method !== "POST" || url.pathname !== "/ask") {
      return respond({ error: "Adres veya istek geçersiz." }, 404);
    }

    if (!env.GEMINI_API_KEY) {
      return respond({ error: "Gemini API anahtarı henüz ayarlanmamış." }, 500);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return respond({ error: "Geçersiz JSON." }, 400);
    }

    if (typeof body.message !== "string" ||
        !body.message.trim() ||
        body.message.length > 1000) {
      return respond({ error: "Mesaj boş olamaz ve 1000 karakteri geçemez." }, 400);
    }

    const systemPrompt =
      "Sen AskerGPT'sin. Türkçe konuşan, samimi, saygılı ve " +
      "yardımsever bir yapay zekâ asistanısın. Sorulara doğru, " +
      "özgün ve anlaşılır cevaplar ver. SMS için uygun olacak " +
      "şekilde genellikle kısa cevap yaz. Bilmediğin şeyleri " +
      "uydurma. Hassas askerî bilgiler istenirse bunları paylaşma. " +
      "Gerektiğinde kullanıcıya ailesinden veya güvendiği birinden " +
      "destek almasını nazikçe öner.";

    try {
      const aiResponse = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: systemPrompt }]
            },
            contents: [{
              role: "user",
              parts: [{ text: body.message.trim() }]
            }],
            generationConfig: {
              maxOutputTokens: 250,
              temperature: 0.7
            }
          })
        }
      );

      const result = await aiResponse.json();

      if (!aiResponse.ok) {
        console.error("Gemini HTTP status:", aiResponse.status);
        return respond({
          error: aiResponse.status === 429
            ? "AI kotası dolmuş olabilir. Daha sonra tekrar dene."
            : "Yapay zekâ şu anda yanıt veremedi. Ayarları kontrol et."
        }, 502);
      }

      const reply = result.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

      if (!reply) {
        return respond({ error: "Yanıt üretilemedi. Tekrar dene." }, 502);
      }

      return respond({ reply });
    } catch (error) {
      console.error("Gemini bağlantı hatası:", error);
      return respond({ error: "Yapay zekâ bağlantısında hata oluştu." }, 502);
    }
  }
};
