import heic2any from "heic2any";

 export function utils() {

    function isHEIC(file: File): boolean {
        if (!file) return false;

        if (file.type) {
            const ext = file.type.replace("image/", "").toLowerCase();
            return ext === "heic" || ext === "heif";
        }

        if (file.name) {
            const ext = file.name.split(".").pop()?.toLowerCase();
            return ext === "heic" || ext === "heif";
        }

        return false;
    }

    async function convertToWebP(file: File, availableName: string): Promise<File> {



        if (isHEIC(file)) {

            const result = await heic2any({
                blob: file,
                toType: "image/webp",
                quality: 0.6,
            });

            const blob = Array.isArray(result) ? result[0] : result;

            return new File([blob], availableName, { type: 'image/webp' });
        }
        else {

            const imageBitmap = await createImageBitmap(file);
            const canvas = document.createElement('canvas');
            canvas.width = imageBitmap.width;
            canvas.height = imageBitmap.height;

            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Não foi possível criar contexto de canvas");

            ctx.drawImage(imageBitmap, 0, 0);

            return new Promise((resolve, reject) => {
                canvas.toBlob(blob => {
                    if (blob) {
                        resolve(new File([blob], availableName, { type: 'image/webp' }));
                    } else {
                        reject(new Error("Falha ao converter imagem para WebP"));
                    }
                }, 'image/webp', 0.6);
            });
        }
    }

    return {
        convertToWebP
    }
}