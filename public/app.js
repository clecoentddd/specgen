import { interpretJson } from "./interpreter.js";
import { generateSpecification } from "./specificator.js";

interpretBtn.addEventListener("click", () => {
  const json = document.getElementById("jsonInput").value;
  const result = interpretJson(json);

  const interpretation = document.getElementById("interpretation");
  const warningsList = document.getElementById("warningsList");

  // Clear previous content
  interpretation.replaceChildren();
  warningsList.replaceChildren();

  // === Inject External Event Simulator Slice ===
  const uniqueExternalEventTitles = new Set();
  result.slices.forEach(slice => {
    (slice.externalEvents || []).forEach(e => {
      uniqueExternalEventTitles.add(
        e.title.replace(/\*\*EXTERNAL:\*\* /g, "").trim()
      );
    });
  });

  if (uniqueExternalEventTitles.size > 0) {
    const simulatorSlice = {
      index: result.slices.length + 1,
      title: "SIMULATION OF EXTERNAL EVENTS",
      sliceType: "STATE_CHANGE (Automation)",
      visualFlow:
        "**EXTERNAL EVENT** → **SimulateExternalEventCommand** → **Domain Command** → **Domain Event**",
      screens: [{ title: "External Event Console UI" }],
      commands: [{ title: "SimulateExternalEventCommand" }],
      events: [],
      externalEvents: Array.from(uniqueExternalEventTitles).map(t => ({
        title: t,
      })),
      readmodels: [],
      bddTests: [],
      readmodelDetails: null,
      flow: [],
    };
    result.slices.push(simulatorSlice);
  }

  // === Helper functions ===
  const createEl = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (className) el.className = className;
    return el;
  };

  const appendSection = (container, title, content) => {
    container.append(
      createEl("h3", title),
      createEl("pre", typeof content === "string" ? content : JSON.stringify(content, null, 2)),
      document.createElement("hr")
    );
  };

  // === Global Summary ===
  appendSection(interpretation, "Global Summary", result.summary);

  // === System Flow ===
  if (result.slices.length > 1) {
    const flowTitles = result.slices
      .sort((a, b) => a.index - b.index)
      .map(s => `${s.title} (${s.sliceType})`)
      .join(" → ");

    interpretation.append(
      createEl("h3", "System Flow"),
      createEl("p", flowTitles, "system-flow"),
      document.createElement("hr")
    );
  }

  // === Slice Details ===
  result.slices.forEach(slice => {
    const typeClass = slice.sliceType
      .toLowerCase()
      .replace(/[\s()]/g, "")
      .replace("_", "-");

    const sliceHeader = createEl("div", "", "slice-header");
    sliceHeader.append(
      createEl(
        "h3",
        `Slice ${slice.index}: ${slice.title} (${slice.sliceType})`
      ),
      createEl("p", `Internal Flow: ${slice.visualFlow}`)
    );

    const sliceObjects = createEl("div", "", "slice-objects-container");
    sliceObjects.append(
      createEl(
        "p",
        `Screens: ${listTitles(slice.screens)}`
      ),
      createEl(
        "p",
        `Commands: ${listTitles(slice.commands)}`
      ),
      createEl(
        "p",
        `Events: ${listTitles(slice.events)}`
      ),
      createEl(
        "p",
        `External Events: ${listTitles(slice.externalEvents)}`
      ),
      createEl(
        "p",
        `Read Models: ${listTitles(slice.readmodels)}`
      )
    );

    interpretation.append(sliceHeader, sliceObjects);

    const bddHeader = createEl(
      "h4",
      `BDD Specifications (${slice.bddTests.length})`,
      "bdd-specifications-header"
    );
    interpretation.append(bddHeader);

    if (slice.bddTests.length === 0) {
      interpretation.append(
        createEl("p", "No BDD specifications for this slice.", "no-bdd-specs")
      );
    } else {
      slice.bddTests.forEach(test => {
        const block = createEl("div", "", "bdd-block");
        block.append(createEl("h5", test.title));

        if (test.comments?.length) {
          block.append(createEl("p", test.comments.join(" / "), "bdd-comments"));
        }

        block.append(
          createEl("p", `Given: ${formatSteps(test.given)}`),
          createEl("p", `When: ${formatSteps(test.when)}`),
          createEl("p", `Then: ${formatSteps(test.then)}`)
        );

        interpretation.append(block);
      });
    }

    interpretation.append(document.createElement("hr"));
  });

  // === Warnings ===
  if (result.warnings.length > 0) {
    result.warnings.forEach(w => {
      warningsList.append(createEl("li", w));
    });
  }

  // === Specification Generation ===
  const spec = generateSpecification(result);

  // Move AI constraints to top
  const aiConstraints = spec.developerNotes.shift();

  appendSection(
    interpretation,
    "🤖 AI Constraints & Self-Verification",
    aiConstraints
  );

  interpretation.append(
    createEl("h3", "🔧 Generated Project Specification"),
    createEl("p", "This is the proposed Node.js / browser event-sourced architecture."),
    createEl("pre", formatFileTree(spec.fileStructure)),
    createEl("h3", "Other Developer Notes"),
    createEl("pre", JSON.stringify(spec.developerNotes, null, 2))
  );

  if (typeof specifyBtn !== "undefined") {
    specifyBtn.disabled = false;
  }

  window.currentInterpretation = result;
});

// === Helpers ===
function listTitles(arr) {
  return (arr || []).map(o => o.title).join(", ") || "(none)";
}

function formatSteps(steps) {
  return (steps || [])
    .map(step => `${step.title} (${step.fields})`)
    .join("; ");
}

function formatFileTree(obj, indent = 0) {
  const pad = "  ".repeat(indent);
  let str = "";
  for (const key in obj) {
    const value = obj[key];
    if (typeof value === "object" && !value?.startsWith?.("//")) {
      str += `${pad}📁 ${key}\n${formatFileTree(value, indent + 1)}`;
    } else {
      str += `${pad}📄 ${key}\n`;
    }
  }
  return str;
}
