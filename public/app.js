const form = document.getElementById('uploadForm');
const preview = document.getElementById('preview');

function disabledInputs() {
    document.querySelectorAll("#settings input").forEach(i =>
        i.disabled = true
    );
}
function enableInputs() {
    document.querySelectorAll("#settings input").forEach(i =>
        i.disabled = false
    );
}
disabledInputs();

// Filter pages
function parsePageSelection(input, totalPages) {
    const pages = new Set();
    if (!input) return [...Array(totalPages).keys()].map(i => i+1);

    const parts = input.split(",");
    for (let part of parts) {
        if (part.includes("-")) {
            let [start, end] = part.split("-").map(Number);
            for (let i = start; i <= end; i++) pages.add(i);
        } else {
            pages.add(Number(part));
        }
    }
    return [...pages];
}

form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const formData = new FormData(form);

    const file = formData.get('pdfFile');
    if (!file || !file.name) {
        alert('Please select a PDF file before uploading.');
        return;
    }

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success && result.images) { // <-- fixed
            handlePreviewImages(result.images);
            enableInputs();
        } else {
            alert(result.message || "Upload failed");
        }

    } catch (error){
        console.error('Upload/convert error:', error);
        alert("An unexpected error occurred. Please try again.");
    }
});

// Render preview
function renderPreview(allPages, selectedPages, color, paperSize) {
    preview.innerHTML = "";

    selectedPages.forEach(pageNum => {
        const img = document.createElement("img");
        img.src = allPages[pageNum - 1];
        img.classList.add("PaperSize");

        if (color === "bw") img.classList.add("bw");
        //img.classList.add(paperSize);

        preview.appendChild(img);
    });
}

let allPagesImages = { letter: [], legal: []};

function handlePreviewImages(images) {
    allPagesImages = images;
    updatePreview();
}

function updatePreview() {
    const pagesInput = document.getElementById("pages").value;
    const color = document.querySelector("input[name='color']:checked")?.value;
    const paper = document.querySelector("input[name='paperSize']:checked")?.value;

    if (!color || !paper) return;

    const selectedPages = parsePageSelection(pagesInput, allPagesImages[paper].length);
    renderPreview(allPagesImages[paper], selectedPages, color);
}

// attach events properly
document.getElementById("pages").addEventListener("input", updatePreview);
document.getElementById("copies").addEventListener("input", updatePreview);

document.querySelectorAll("input[name='color']").forEach(el => 
    el.addEventListener("change", updatePreview)
);

document.querySelectorAll("input[name='paperSize']").forEach(el =>
    el.addEventListener("change", updatePreview)
);
