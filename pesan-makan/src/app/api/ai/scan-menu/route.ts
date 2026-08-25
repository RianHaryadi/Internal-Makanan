import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageBase64, mimeType } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: "Gambar foto menu wajib dilampirkan" },
        { status: 400 }
      );
    }

    const apiKey =
      process.env.AI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      "sk-e6cfb804412ade1e-dkwlun-4c5c16cc";

    const baseUrl = (
      process.env.AI_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      "https://9router.aidonext.com/v1"
    ).replace(/\/+$/, "");

    const formattedImage = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:${mimeType || "image/jpeg"};base64,${imageBase64}`;

    const promptText = `Anda adalah asisten AI yang ahli membaca foto menu makanan, buku menu, papan menu, atau spanduk warung/cafe.
Ekstrak semua daftar menu makanan & minuman yang terbaca beserta harganya.

Kembalikan HANYA JSON valid dengan format persis seperti ini:
{
  "namaWarung": "Nama Warung / Restoran (jika terbaca, jika tidak kosongkan string '')",
  "menus": [
    {
      "namaItem": "Nama Menu",
      "harga": 20000
    }
  ]
}

Aturan penting:
1. "harga" WAJIB angka integer positif (misal: '15rb', '15k', '15.000' -> 15000).
2. Jika ada menu dengan varian (ukuran/rasa/porsi) yang harganya berbeda, pisahkan menjadi item masing-masing.
3. Hanya sertakan item makanan/minuman yang memiliki nama dan harga.
4. Jangan sertakan teks markdown lain di luar objek JSON.`;

    const modelsToTry = [
      process.env.AI_MODEL || "AI",
      "AI",
      "AI/amanai/glm-5v-turbo",
      "AI/amanai/claude-sonnet-4.6",
      "AI/amanai/gpt-5.4-mini",
    ];

    let lastError = "";

    for (const model of modelsToTry) {
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            stream: false,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: promptText,
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: formattedImage,
                    },
                  },
                ],
              },
            ],
            temperature: 0.1,
          }),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          lastError = `Model ${model} returned ${response.status}: ${errText}`;
          console.warn(lastError);
          continue;
        }

        const rawText = await response.text();
        let content = "";

        try {
          const jsonResp = JSON.parse(rawText);
          content = jsonResp?.choices?.[0]?.message?.content || "";
        } catch {
          // If SSE stream format arrived
          const lines = rawText.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ") && !line.includes("[DONE]")) {
              try {
                const chunk = JSON.parse(line.slice(6));
                content +=
                  chunk?.choices?.[0]?.delta?.content ||
                  chunk?.choices?.[0]?.message?.content ||
                  "";
              } catch {
                // ignore chunk parse error
              }
            }
          }
        }

        if (!content) {
          content = rawText;
        }

        // Clean markdown backticks if any
        let cleanJsonStr = content.trim();
        if (cleanJsonStr.startsWith("```")) {
          cleanJsonStr = cleanJsonStr
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, "");
        }

        let parsed: {
          namaWarung?: string;
          menus?: Array<{ namaItem: string; harga: number }>;
        };

        try {
          parsed = JSON.parse(cleanJsonStr);
        } catch {
          const jsonMatch = cleanJsonStr.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error(
              `Respon AI tidak berupa JSON valid: ${cleanJsonStr.slice(0, 200)}`
            );
          }
        }

        const validMenus = (parsed.menus || [])
          .filter((m) => m && m.namaItem && typeof m.namaItem === "string")
          .map((m) => ({
            namaItem: m.namaItem.trim(),
            harga: Math.max(0, Math.round(Number(m.harga) || 0)),
          }))
          .filter((m) => m.namaItem.length > 0 && m.harga > 0);

        return NextResponse.json({
          success: true,
          namaWarung: (parsed.namaWarung || "").trim(),
          menus: validMenus,
          count: validMenus.length,
        });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(`Attempt with ${model} failed:`, lastError);
      }
    }

    return NextResponse.json(
      { error: `Gagal memproses gambar: ${lastError}` },
      { status: 500 }
    );
  } catch (error) {
    console.error("AI Scan Menu Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Terjadi kesalahan server",
      },
      { status: 500 }
    );
  }
}
