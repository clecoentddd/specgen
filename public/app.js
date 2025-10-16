// app.js
import { interpretJson } from "./interpreter.js";
import { generateSpecification } from "./specificator.js";

interpretBtn.addEventListener("click", () => {
    const json = document.getElementById("jsonInput").value;
    const result = interpretJson(json);

    const interpretation = document.getElementById("interpretation");
    const warningsList = document.getElementById("warningsList");
    interpretation.innerHTML = "";

    // === Global Summary ===
    interpretation.innerHTML += `<h3>Global Summary</h3>`;
    interpretation.innerHTML += `<pre>${JSON.stringify(result.summary, null, 2)}</pre>`;
    interpretation.innerHTML += `<hr>`;

    // === System Flow ===
    if (result.slices.length > 1) {
        const flowTitles = result.slices
            .sort((a, b) => a.index - b.index)
            .map(s => `${s.title} (${s.sliceType})`)
            .join(' &rarr; ');
        interpretation.innerHTML += `<h3>System Flow</h3>`;
        interpretation.innerHTML += `<p class="system-flow">${flowTitles}</p><hr>`;
    }

    // === Slice Details ===
    result.slices.forEach(slice => {
        const typeClass = slice.sliceType.toLowerCase().replace('_', '-');

        interpretation.innerHTML += `
            <div class="slice-header">
                <h3>Slice ${slice.index}: ${slice.title} 
                    (<span class="slice-type-${typeClass}">${slice.sliceType}</span>)
                </h3>
                <p><strong>Internal Flow:</strong> ${slice.visualFlow}</p>
            </div>
            <div class="slice-objects-container">
                <p><b>Screens:</b> ${(slice.screens || []).map(o => o.title).join(", ") || "(none)"}</p>
                <p><b>Commands:</b> ${(slice.commands || []).map(o => o.title).join(", ") || "(none)"}</p>
                <p><b>Events:</b> ${(slice.events || []).map(o => o.title).join(", ") || "(none)"}</p>
                <p><b>Read Models:</b> ${(slice.readmodels || []).map(o => o.title).join(", ") || "(none)"}</p>
            </div>
            <h4 class="bdd-specifications-header">BDD Specifications (${slice.bddTests.length})</h4>
        `;

        if (slice.bddTests.length === 0) {
            interpretation.innerHTML += `<p class="no-bdd-specs">No BDD specifications for this slice.</p>`;
        } else {
            slice.bddTests.forEach(test => {
                const formatSteps = steps => (steps || []).map(step =>
                    `<span><i class="bdd-step-title">${step.title}</i> (${step.fields})</span>`
                ).join("; ");

                const comments = (test.comments || []).join(" / ");
                interpretation.innerHTML += `
                    <div class="bdd-block">
                        <h5>${test.title}</h5>
                        ${comments ? `<p class="bdd-comments">${comments}</p>` : ""}
                        <p><b>Given:</b> ${formatSteps(test.given)}</p>
                        <p><b>When:</b> ${formatSteps(test.when)}</p>
                        <p><b>Then:</b> ${formatSteps(test.then)}</p>
                    </div>
                `;
            });
        }

        interpretation.innerHTML += `<hr>`;
    });

    // === Warnings ===
    warningsList.innerHTML = "";
    if (result.warnings.length > 0) {
        warningsList.innerHTML = result.warnings.map(w => `<li>${w}</li>`).join("");
    }

    // === SPECIFICATION GENERATION ===
    const spec = generateSpecification(result);

    interpretation.innerHTML += `
        <h3>🔧 Generated Project Specification</h3>
        <p>This is the proposed Node.js / browser event-sourced architecture.</p>
        <pre>${formatFileTree(spec.fileStructure)}</pre>
        <h4>Developer Notes</h4>
        <pre>${JSON.stringify(spec.developerNotes, null, 2)}</pre>
    `;

    if (typeof specifyBtn !== 'undefined') {
        specifyBtn.disabled = false;
    }

    window.currentInterpretation = result;
});

// === Helper: Format nested file structure for HTML display ===
function formatFileTree(obj, indent = 0) {
    const pad = "  ".repeat(indent);
    let str = "";
    for (const key in obj) {
        if (typeof obj[key] === "object" && !obj[key].startsWith?.("//")) {
            str += `${pad}📁 ${key}\n` + formatFileTree(obj[key], indent + 1);
        } else {
            str += `${pad}📄 ${key}\n`;
        }
    }
    return str;
}
