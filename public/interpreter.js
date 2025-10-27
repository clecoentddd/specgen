/**
 * Helper to process fields into a concatenated string (name=example, ...)
 * @param {Array<Object>} fields - The fields array from a Command, Event, or ReadModel.
 * @returns {string} Formatted string of fields.
 */
const formatFields = (fields) => {
    if (!fields || fields.length === 0) return '(none)';
    return fields.map(field => {
        const name = field && field.name ? String(field.name) : '';
        if (!name) return '';

        const value = field.example !== undefined && field.example !== null 
            ? String(field.example).replace(/"/g, '') 
            : '';
            
        return `${name}=${value}`;
    }).filter(s => s.length > 0).join(', ');
};

// ----------------------------------------------------------------------------- 

/**
 * Processes the 'examples' array for BDD Read Model steps (list results) or any list data.
 * @param {Array<Object>} examples - The examples array containing lists of result objects.
 * @returns {string} Formatted string of example lists: (field=value, ...); (field=value, ...)
 */
const formatReadModelExamples = (examples) => {
    if (!examples || examples.length === 0) return '(none)';

    const formattedExamples = examples.map(example => {
        if (typeof example !== 'object' || example === null || Array.isArray(example)) {
             return `(${String(example).replace(/"/g, '')})`;
        }

        const fields = Object.entries(example).map(([key, value]) => {
            return `${key}=${String(value).replace(/"/g, '')}`;
        }).join(', ');
        return `(${fields})`;
    });

    return formattedExamples.join('; ');
};

// ----------------------------------------------------------------------------- 

/**
 * Find all events across all slices by their IDs
 */
const buildEventLookup = (slices) => {
    const lookup = {};
    slices.forEach(slice => {
        (slice.events || []).forEach(event => {
            lookup[event.id] = event;
        });
    });
    return lookup;
};

/**
 * Find all elements across all slices by their IDs
 */
const buildElementLookup = (slices) => {
    const lookup = {};
    slices.forEach(slice => {
        ['commands', 'events', 'readmodels', 'screens'].forEach(elementType => {
            (slice[elementType] || []).forEach(element => {
                lookup[element.id] = element;
            });
        });
    });
    return lookup;
};

// ----------------------------------------------------------------------------- 

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
    
    // Build lookup tables for cross-slice references
    const eventLookup = buildEventLookup(data.slices);
    const elementLookup = buildElementLookup(data.slices);
    
    // Global Sets to track unique internal and external events by title
    const uniqueEventTitles = new Set();
    const uniqueExternalEventTitles = new Set();

    // Process each slice
    const sliceSummaries = data.slices.map((slice, index) => {
        // Safely retrieve properties, defaulting to empty arrays
        const commands = slice.commands || [];
        const screens = slice.screens || [];
        const readmodels = slice.readmodels || [];
        const specs = slice.specifications || [];

        // Track screens already used in this slice
        const usedScreenIds = new Set();

        // Process events to correctly title and filter
        const processedEvents = (slice.events || []).map(e => {
            const isExternal = e.context === 'EXTERNAL';
            const title = isExternal ? `**EXTERNAL:** ${e.title}` : e.title;
            if (isExternal) uniqueExternalEventTitles.add(e.title);
            else uniqueEventTitles.add(e.title);
            return { ...e, isExternal, title };
        });

        const internalEvents = processedEvents.filter(e => !e.isExternal);
        const externalEvents = processedEvents.filter(e => e.isExternal);
        const events = processedEvents;

        // --- Flow Logic ---
        let flow = [];
        let readmodelDetails = null;
        let isTodoListProjection = false;
        let primaryReadModel = readmodels.length > 0 ? readmodels[0] : null;
        let todoEvents = [];

        if (slice.sliceType === 'STATE_VIEW') {
            if (!primaryReadModel) {
                result.warnings.push(`STATE_VIEW slice "${slice.title}" has no ReadModel defined.`);
            } else {
                const inboundEventIds = new Set();
                const outboundEventIds = new Set();

                // ReadModel dependencies
                (primaryReadModel.dependencies || []).forEach(dep => {
                    if (dep.elementType === 'EVENT' && dep.type === 'INBOUND') inboundEventIds.add(dep.id);
                    if (dep.elementType === 'EVENT' && dep.type === 'OUTBOUND') outboundEventIds.add(dep.id);
                });

                // Check all events pointing to this ReadModel
                Object.values(eventLookup).forEach(event => {
                    (event.dependencies || []).forEach(dep => {
                        if (dep.elementType === 'READMODEL' && dep.id === primaryReadModel.id && dep.type === 'OUTBOUND') {
                            inboundEventIds.add(event.id);
                        }
                    });
                });

                const inboundEvents = Array.from(inboundEventIds)
                    .map(id => eventLookup[id] || elementLookup[id])
                    .filter(e => e);
                const outboundEvents = Array.from(outboundEventIds)
                    .map(id => eventLookup[id] || elementLookup[id])
                    .filter(e => e);

                // Filter screens and mark as used
                const outboundScreens = screens.filter(s => 
                    !usedScreenIds.has(s.id) &&
                    s.dependencies?.some(d => d.elementType === 'READMODEL' && (d.id === primaryReadModel.id || d.type === 'INBOUND'))
                );
                outboundScreens.forEach(s => usedScreenIds.add(s.id));

                // To-Do List Projection check
                isTodoListProjection = inboundEvents.length > 0 && outboundEvents.length > 0;
                todoEvents = outboundEvents;

                const rmDescription = isTodoListProjection 
                    ? "State projection / **TODO list (Two-event pattern)**"
                    : "State projection / User view";
                const rmTitle = primaryReadModel.title;
                const rmDisplayTitle = isTodoListProjection ? `**TODO:** ${rmTitle}` : rmTitle;

                // Build flow
                flow.push(
                    ...inboundEvents.map(e => ({ type: "EVENT", title: e.title, description: e.description || "Event that populates the read model" })),
                    { type: "READMODEL", title: rmDisplayTitle, description: rmDescription },
                    ...outboundScreens.map(s => ({ type: "SCREEN", title: s.title, description: s.description || "User view" }))
                );

                if (isTodoListProjection && todoEvents.length > 0) {
                    flow.push(
                        ...todoEvents.map(e => ({ type: "EVENT", title: e.title, description: `Event that removes/completes items from ${primaryReadModel.title}` }))
                    );
                    result.warnings.push(
                        `ReadModel "${primaryReadModel.title}" is a **To-Do List Projection** with ` +
                        `${inboundEvents.length} ADD event(s): [${inboundEvents.map(e => e.title).join(", ")}] and ` +
                        `${todoEvents.length} REMOVE/DONE event(s): [${todoEvents.map(e => e.title).join(", ")}]`
                    );
                }

                readmodelDetails = {
                    exists: true,
                    inboundEvents: inboundEvents.map(e => e.title).join(", ") || "(none)",
                    outboundEvents: outboundEvents.map(e => e.title).join(", ") || "(none)",
                    eventsSubscribedTo: inboundEvents.map(e => e.title).join(", ") || "(none)",
                    consumer: outboundScreens.map(s => s.title).join(", ") || "(none)",
                    todoList: isTodoListProjection,
                    totalInboundEvents: inboundEvents.length,
                    totalOutboundEvents: outboundEvents.length
                };

                if (inboundEvents.length === 0) {
                    result.warnings.push(
                        `STATE_VIEW slice "${slice.title}" ReadModel "${primaryReadModel.title}" has no inbound events.`
                    );
                }
            }
        } else if (slice.sliceType === 'STATE_CHANGE') {
            const isCompletionSlice = commands.some(c => c.title.toLowerCase().includes('prepared') || c.title.toLowerCase().includes('mark') || c.title.toLowerCase().includes('complete'))
                || events.some(e => e.title.toLowerCase().includes('prepared') || e.title.toLowerCase().includes('completed'));

            flow.push(
                ...screens.map(s => ({ type: "SCREEN", title: s.title, description: s.description || "User interface" })),
                ...commands.map(c => ({ type: "COMMAND", title: c.title, description: c.description || "Command executed" })),
                ...events.map(e => {
                    let title = e.title;
                    let description = e.description || "Event triggered";
                    if (isCompletionSlice && (e.title.toLowerCase().includes('prepared') || e.title.toLowerCase().includes('completed'))) {
                        title = `**${e.title} (Completes To-Do List Item)**`;
                        description = "Completion event - marks item as done";
                    }
                    return { type: "EVENT", title, description };
                })
            );
        } else {
            flow.push(
                ...screens.map(s => ({ type: "SCREEN", title: s.title, description: s.description || "" })),
                ...commands.map(c => ({ type: "COMMAND", title: c.title, description: c.description || "" })),
                ...events.map(e => ({ type: "EVENT", title: e.title, description: e.description || "" }))
            );
            if (slice.sliceType) result.warnings.push(`Slice "${slice.title}" has unhandled sliceType: ${slice.sliceType}`);
        }

        // --- Visual Flow ---
        let visualFlow = "";
        if (slice.sliceType === 'STATE_VIEW' && isTodoListProjection && primaryReadModel && todoEvents.length > 0) {
            const rmTitle = primaryReadModel.title;
            const rmDisplayTitle = `**TODO:** ${rmTitle}`;
            const completionEventTitles = todoEvents.map(e => e.title).join(", ");
            const flowTitlesSeen = new Set();
            const forwardElements = flow.filter(f => {
                const isCompletionEvent = todoEvents.some(e => f.title.includes(e.title));
                const uniqueKey = `${f.type}:${f.title}`;
                if (isCompletionEvent || !f.title || flowTitlesSeen.has(uniqueKey)) return false;
                flowTitlesSeen.add(uniqueKey);
                return true;
            }).map(f => f.title);

            const rmIndex = forwardElements.findIndex(t => t.includes(rmDisplayTitle) || t.includes(rmTitle));
            if (rmIndex !== -1 && completionEventTitles) {
                const preRM = forwardElements.slice(0, rmIndex + 1);
                const postRM = forwardElements.slice(rmIndex + 1);
                visualFlow = [...preRM, `**⇠** ${completionEventTitles}`, ...postRM].join(" ➜ ");
            } else {
                visualFlow = forwardElements.join(" ➜ ");
            }
        } else {
            const flowTitlesSeen = new Set();
            visualFlow = flow.filter(f => {
                if (!f.title || flowTitlesSeen.has(f.title)) return false;
                flowTitlesSeen.add(f.title);
                return true;
            }).map(f => f.title).join(" ➜ ");
        }

        // --- BDD tests ---
        const bddTests = specs.map(spec => {
            const mapSteps = (steps) => (steps || []).map(step => {
                let fieldsString;
                const hasExamples = Array.isArray(step.examples) && step.examples.length > 0;
                if (hasExamples) {
                    fieldsString = formatReadModelExamples(step.examples);
                    if (Array.isArray(step.fields) && step.fields.length > 0) {
                        result.warnings.push(`BDD Specification "${spec.title}" step '${step.title}' has both 'fields' and 'examples'. Using 'examples' only.`);
                    }
                } else fieldsString = formatFields(step.fields);
                return { title: step.title, type: step.type, fields: fieldsString };
            });
            return { title: spec.title, comments: spec.comments?.map(c => c.description) || [], given: mapSteps(spec.given), when: mapSteps(spec.when), then: mapSteps(spec.then) };
        });

        // Build slice object
        const sliceObj = { index: index + 1, title: slice.title, sliceType: slice.sliceType, flow, visualFlow,
            commands: commands.map(c => ({ title: c.title, description: c.description || "Command executed" })),
            events: internalEvents.map(e => ({ title: e.title, description: e.description || "Event triggered" })),
            externalEvents: externalEvents.map(e => ({ title: e.title, description: e.description || "External event received" })),
            screens: screens.map(s => ({ title: s.title, description: s.description || "User interface" })),
            readmodels: readmodels.map(rm => ({ title: rm.title, description: rm.description || "State projection" })),
            readmodelDetails, bddTests
        };

        result.slices.push(sliceObj);
        return sliceObj;
    });

    // Global summary

    const uniqueScreenIds = new Set();
data.slices.forEach(slice => (slice.screens || []).forEach(screen => uniqueScreenIds.add(screen.id)));

    result.summary = {
        totalSlices: data.slices.length,
        totalCommands: data.slices.reduce((acc, s) => acc + (s.commands?.length || 0), 0),
        totalEvents: uniqueEventTitles.size,
        totalExternalEvents: uniqueExternalEventTitles.size,
        totalScreens: uniqueScreenIds.size,
        totalReadModels: data.slices.reduce((acc, s) => acc + (s.readmodels?.length || 0), 0),
        totalSpecifications: data.slices.reduce((acc, s) => acc + (s.specifications?.length || 0), 0),
        sliceDetails: sliceSummaries
    };

    return result;
}
