// DOM elements
const form = document.getElementById('uploadForm');
const preview = document.getElementById('preview');
const fileInput = form.querySelector("input[type='file']");
const uploadButton = form.querySelector("button[type='submit']");
const pageMode = document.getElementById("pageMode");
const pagesInput = document.getElementById("pages");
const customWrapper = document.getElementById("customPageWrapper");
const copiesInput = document.getElementById("copies");
const colorSelect = document.getElementById("color");
const paperSelect = document.getElementById("paperSize");
const clearButton = document.getElementById("clearBtn");
const proceedBtn = document.getElementById("proceedBtn");

let lastUploadedBaseName = null;
let totalPages = 0;
let allPagesImages = { letter: [], legal: [] };

// --- Page mode logic ---
pageMode.addEventListener("change", () => {
    if (pageMode.value === "custom") {
        pagesInput.disabled = false;
        customWrapper.classList.add("show");
    } else {
        pagesInput.disabled = true;
        customWrapper.classList.remove("show");
        pagesInput.value = "";
    }
    updatePreview();
});

// --- Reset form ---
function resetForm() {
    form.reset();
    preview.innerHTML = "";
    pagesInput.disabled = true;
    totalPages = 0;
    allPagesImages = { letter: [], legal: [] };

    if (lastUploadedBaseName) {
        fetch(`/delete-last/${lastUploadedBaseName}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(data => console.log('Previous files deleted:', data))
            .catch(err => console.error(err));
        lastUploadedBaseName = null;
    }
}

clearButton.addEventListener("click", e => {
    e.preventDefault();
    resetForm();
});

// --- Page selection helpers ---
function parsePageSelection(input, totalPages) {
    if (!input) return [];
    let corrected = false;
    const ranges = input.split(",").map(p => p.trim());
    const pages = new Set();
    const correctedParts = [];

    for (let part of ranges) {
        if (/^\d+-\d+$/.test(part)) {
            let [start, end] = part.split("-").map(Number);
            if (start < 1) start = 1;
            if (end < 1) end = 1;
            if (start > end) [start, end] = [end, start];
            if (start > totalPages) start = totalPages;
            if (end > totalPages) end = totalPages;
            correctedParts.push(`${start}-${end}`);
            for (let i = start; i <= end; i++) pages.add(i);
        } else if (/^\d+$/.test(part)) {
            let num = Number(part);
            if (num < 1) num = 1;
            if (num > totalPages) num = totalPages;
            correctedParts.push(String(num));
            pages.add(num);
        }
    }

    if (correctedParts.length) pagesInput.value = correctedParts.join(", ");
    return [...pages];
}

function getSelectedPages() {
    if (!totalPages) return [];
    switch (pageMode.value) {
        case "all": return Array.from({ length: totalPages }, (_, i) => i + 1);
        case "odd": return Array.from({ length: totalPages }, (_, i) => i + 1).filter(n => n % 2 !== 0);
        case "even": return Array.from({ length: totalPages }, (_, i) => i + 1).filter(n => n % 2 === 0);
        case "custom": return parsePageSelection(pagesInput.value, totalPages);
        default: return [];
    }
}

// --- Preview ---
function handlePreviewImages(images) {
    allPagesImages = images;
    totalPages = images.letter.length;
}

function renderPreview(allPages, selectedPages, color) {
    preview.innerHTML = "";
    if (!allPages.length) {
        preview.innerHTML = "<p>No pages available.</p>";
        return;
    }
    selectedPages.forEach(num => {
        if (!allPages[num - 1]) return;
        const img = document.createElement("img");
        img.src = allPages[num - 1];
        if (color === "bw") img.classList.add("bw");
        preview.appendChild(img);
    });
}

function updatePreview() {
    if (!totalPages) return;
    const selectedPages = getSelectedPages();
    if (selectedPages.length === 0) return;
    renderPreview(allPagesImages[paperSelect.value], selectedPages, colorSelect.value);
}

pagesInput.addEventListener("input", updatePreview);
copiesInput.addEventListener("input", updatePreview);
colorSelect.addEventListener("change", updatePreview);
paperSelect.addEventListener("change", updatePreview);

// --- File upload ---
form.addEventListener("submit", async e => {
    e.preventDefault();
    const file = fileInput.files[0];
    if (!file) return alert("Select a PDF first.");

    const formData = new FormData();
    formData.append("pdfFile", file);

    try {
        const response = await fetch("/upload", { method: "POST", body: formData });
        const result = await response.json();

        if (!result.success) return alert(result.message || "Upload failed");

        lastUploadedBaseName = result.baseName;
        handlePreviewImages(result.images);

        // Set paper size based on original
        if (result.originalSize === "letter" || result.originalSize === "legal") {
            paperSelect.value = result.originalSize;
        }

        updatePreview();
    } catch (err) {
        console.error(err);
        alert("Upload error.");
    }
});

// --- Proceed ---
proceedBtn.addEventListener("click", async () => {
    if (!lastUploadedBaseName) return alert("Upload a PDF first.");

    const selectedPages = getSelectedPages();
    if (!selectedPages.length) return alert("Select pages first.");

    const data = {
        Date: new Date().toISOString(),
        Amount: 0,
        Color: colorSelect.value,
        Pages: selectedPages.join(","),
        Copies: copiesInput.value,
        Paper_Size: paperSelect.value,
        File_Path: lastUploadedBaseName,
        File_Size: "0",
        Status: "pending"
    };

    try {
        const response = await fetch("/transaction/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (result.success) {
            window.location.href = `/cost.html?id=${result.id}&pages=${data.Pages}&copies=${data.Copies}&color=${data.Color}&paper=${data.Paper_Size}&baseName=${data.File_Path}`;
        } else alert(result.message || "Transaction failed");
    } catch (err) {
        console.error(err);
        alert("Error creating transaction");
    }
});
