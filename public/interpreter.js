// interpreter.js
/**
 * Helper to process fields into a concatenated string (name=example, ...)
 * @param {Array<Object>} fields - The fields array from a Command, Event, or ReadModel.
 * @returns {string} Formatted string of fields.
 */
const formatFields = (fields) => {
    if (!fields || fields.length === 0) return '(none)';
    return fields.map(field => {
        // Use example if available, otherwise just name and assume empty value
        const value = field.example ? field.example.replace(/"/g, '') : '';
        return `${field.name}=${value}`;
    }).join(', ');
};

export function interpretJson(jsonText) {
    const result = {
        summary: {},
        slices: [],
        warnings: []
    };

    let data;
    try {
        data = JSON.parse(jsonText);
    } catch (e) {
        result.warnings.push("Invalid JSON: " + e.message);
        return result;
    }

    if (!data.slices || !Array.isArray(data.slices)) {
        result.warnings.push("Missing 'slices' array in root object.");
        return result;
    }

    // Process each slice
    const sliceSummaries = data.slices.map((slice, index) => {
        // Safely retrieve properties, defaulting to empty arrays
        const commands = slice.commands || [];
        const events = slice.events || [];
        const screens = slice.screens || [];
        const readmodels = slice.readmodels || []; // ADDED READMODELS
        const specs = slice.specifications || [];

        let flow = [];
        let visualFlow = "";
        let readmodelDetails = null; // Store detailed info for STATE_VIEW

        // --- Flow Logic (State Change vs. State View) ---
        if (slice.sliceType === 'STATE_VIEW') {
            // Flow for ReadModel slices: Event (inbound) -> ReadModel -> Screen (outbound)
            // 1. Find Inbound Events (events that cause the ReadModel update)
            const inboundEvents = events.filter(e =>
                e.dependencies.some(d => d.elementType === 'READMODEL' && d.type === 'INBOUND')
            );

            // 2. Find the Primary ReadModel (should usually be one)
            const primaryReadModel = readmodels.length > 0 ? readmodels[0] : null;

            // 3. Find Outbound Screens (screens that consume the ReadModel)
            const outboundScreens = screens.filter(s =>
                s.dependencies.some(d => d.elementType === 'READMODEL' && d.type === 'OUTBOUND')
            );
            
            // Build Flow: EVENT -> READMODEL -> SCREEN
            flow.push(
                ...inboundEvents.map(e => ({ type: "EVENT", title: e.title, description: e.description || "Input event" })),
                ...readmodels.map(rm => ({ type: "READMODEL", title: rm.title, description: rm.description || "State projection" })),
                ...outboundScreens.map(s => ({ type: "SCREEN", title: s.title, description: s.description || "User view" }))
            );

            // Build detailed ReadModel info for output (if one exists)
            if (primaryReadModel) {
                const consumedEvents = primaryReadModel.dependencies
                    .filter(d => d.elementType === 'EVENT' && d.type === 'INBOUND')
                    .map(d => d.elementTitle);

                readmodelDetails = {
                    exists: true,
                    eventsSubscribedTo: consumedEvents.join(", ") || "(none)",
                    consumer: outboundScreens.map(s => s.title).join(", ") || "(none)"
                };
            } else if (readmodels.length > 0) {
                 // Fallback if dependencies are messy, but a readmodel is present
                 readmodelDetails = { exists: true, eventsSubscribedTo: "(unknown/complex logic)", consumer: "(unknown)" };
            } else {
                 readmodelDetails = { exists: false, eventsSubscribedTo: "(none)", consumer: "(none)" };
            }


        } else if (slice.sliceType === 'STATE_CHANGE') {
            // Standard Command/Event flow: Screen (inbound) -> Command -> Event (outbound)
            flow.push(
                ...screens.map(s => ({ type: "SCREEN", title: s.title, description: s.description || "User sees screen" })),
                ...commands.map(c => ({ type: "COMMAND", title: c.title, description: c.description || "Command executed" })),
                ...events.map(e => ({ type: "EVENT", title: e.title, description: e.description || "Event triggered" }))
            );
        } else {
             // Fallback/Legacy Flow (use what's available)
             flow.push(
                ...screens.map(s => ({ type: "SCREEN", title: s.title })),
                ...commands.map(c => ({ type: "COMMAND", title: c.title })),
                ...events.map(e => ({ type: "EVENT", title: e.title }))
            );
             result.warnings.push(`Slice "${slice.title || 'Unknown'}" has unknown/unhandled sliceType: ${slice.sliceType}.`);
        }

        // Remove duplicates and generate visual flow string
        const flowTitlesSeen = new Set();
        visualFlow = flow
            .filter(f => {
                if (!f.title || flowTitlesSeen.has(f.title)) return false;
                flowTitlesSeen.add(f.title);
                return true;
            })
            .map(f => f.title)
            .join(" ➜ ");

        // Generate BDD tests for this slice
        const bddTests = specs.map(spec => ({
            title: spec.title,
            comments: spec.comments?.map(c => c.description) || [],
            
            // Use formatFields helper
            given: (spec.given || []).map(g => ({
                title: g.title,
                type: g.type,
                fields: formatFields(g.fields)
            })),
            when: (spec.when || []).map(w => ({
                title: w.title,
                type: w.type,
                fields: formatFields(w.fields)
            })),
            then: (spec.then || []).map(t => ({
                title: t.title,
                type: t.type,
                fields: formatFields(t.fields)
            }))
        }));

        // Build slice object
        const sliceObj = {
            index: index + 1,
            title: slice.title,
            sliceType: slice.sliceType,
            flow,
            visualFlow,
            commands: commands.map(c => ({ title: c.title, description: c.description || "Command executed" })),
            events: events.map(e => ({ title: e.title, description: e.description || "Event triggered" })),
            screens: screens.map(s => ({ title: s.title, description: s.description || "User sees screen" })),
            readmodels: readmodels.map(rm => ({ title: rm.title, description: rm.description || "State projection" })), // ADDED READMODELS
            readmodelDetails, // ADDED READMODEL DETAILS FOR VIEW_STATE
            bddTests
        };

        result.slices.push(sliceObj);
        return sliceObj;
    });

    // Global summary
    result.summary = {
        totalSlices: data.slices.length,
        totalCommands: data.slices.reduce((acc, s) => acc + (s.commands?.length || 0), 0),
        totalEvents: data.slices.reduce((acc, s) => acc + (s.events?.length || 0), 0),
        totalScreens: data.slices.reduce((acc, s) => acc + (s.screens?.length || 0), 0),
        totalReadModels: data.slices.reduce((acc, s) => acc + (s.readmodels?.length || 0), 0), // ADDED COUNT
        totalSpecifications: data.slices.reduce((acc, s) => acc + (s.specifications?.length || 0), 0),
        sliceDetails: sliceSummaries
    };

    return result;
}