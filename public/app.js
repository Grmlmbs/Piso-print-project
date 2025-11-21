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

let totalPages = 0;

// page mode logic

const pageMode = document.getElementById("pageMode");
const pagesInput = document.getElementById("pages");

function updatePagesTextboxState() {
    if (pageMode.value === "custom") {
        pagesInput.disabled = false;
    } else {
        pagesInput.disabled = true;
    }
}

// Filter pages
function parsePageSelection(input, totalPages) {
    const pages = new Set();
    if (!input) return [];

    const parts = input.split(",");
    for (let part of parts) {
        part = part.trim();
        if (!part) continue;

        if (part.includes("-")) {
            let [start, end] = part.split("-").map(Number);
            if (isNaN(start) || isNaN(end)) continue;
            if (start < 1) start = 1;
            if (end > totalPages) end = totalPages;
            if (start > end) [start, end] = [end, start];

            for (let i = start; i <= end; i++) pages.add(i);
        } else {
            let num = Number(part);
            if (num >= 1 && num <= totalPages) pages.add(num);
            pages.add(Number(part));
        }
    }
    return [...pages];
}

function getSelectedPages() {
    if (!totalPages) return [];

    switch (pageMode.value) {
        case "all":
            return [...Array(totalPages).keys()].map(i => i + 1);
        
        case "odd":
            return [...Array(totalPages).keys()]
                .map(i => i + 1)
                .filter(n => n % 2 !== 0);

        case "even":
            return [...Array(totalPages).keys()]
                .map(i => i + 1)
                .filter(n => n % 2 === 0);

        case "custom":
            return parsePageSelection(pages.value, totalPages);

        default:
            return [];
    }
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
            totalPages = result.totalPages;
            enableInputs();
            updatePagesTextboxState();
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

    if (!allPages || allPages.length === 0) {
        preview.innerHTML = "<p> The specified page is not available.</p>";
        return;
    }
    selectedPages.forEach(pageNum => {
        const imgSrc = allPages[pageNum - 1];

        if (!imgSrc) {
            const errorMsg = document.createElement("p");
            errorMsg.textConten = `Page ${pageNum} does not exist.`;
            errorMsg.style.color = "red";
            preview.appendChild(errorMsg);
            return;
        }
        
        const img = document.createElement("img");
        img.src = imgSrc;
        img.classList.add("PaperSize");

        if (color === "bw") img.classList.add("bw");
        //img.classList.add(paperSize);

        preview.appendChild(img);
    });
}

let allPagesImages = { letter: [], legal: []};

function handlePreviewImages(images) {
    allPagesImages = images;
    totalPages = images.letter.length;
    updatePreview();
}

function updatePreview() {
    const color = document.querySelector("input[name='color']:checked")?.value;
    const paper = document.querySelector("input[name='paperSize']:checked")?.value;

    if (!color || !paper || !totalPages) return;

    const selectedPages = getSelectedPages();
    renderPreview(allPagesImages[paper], selectedPages, color);
}

pagesInput.addEventListener("input", updatePreview);

document
    .getElementById("copies")
    .addEventListener("input", updatePreview);

document.querySelectorAll("input[name='color']").forEach(el => 
    el.addEventListener("change", updatePreview)
);

document.querySelectorAll("input[name='paperSize']").forEach(el =>
    el.addEventListener("change", updatePreview)
);

pageMode.addEventListener("change", () => {
    updatePagesTextboxState();
    updatePreview();
});
