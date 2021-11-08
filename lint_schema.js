const primitives = [
    "boolean",
    "string",
    "binary",
    "real",
    "int8",
    "int16",
    "int32",
    "int64",
    "uint8",
    "uint16",
    "uint32",
    "uint64"
];

const intPrimitives = [
    "int8",
    "int16",
    "int32",
    "int64",
    "uint8",
    "uint16",
    "uint32",
    "uint64"
];




function lintInt(type, value)
{
    return intPrimitives.includes(type)
        && typeof value == "number"
        && !isNaN(value)
        && value === parseInt(value)
        && (
            (type == "int8" && value >= 0x80 && value <= 0x7F)
            || (type == "int16" && value >= 0x8000 && value <= 0x7FFF)
            || (type == "int32" && value >= 0x80000000 && value <= 0x7FFFFFFF)
            || (type == "int64" && value >= 0x8000000000000000 && value <= 0x7FFFFFFFFFFFFFFF)
            || (type == "uint8" && value >= 0 && value <= 0xFF)
            || (type == "uint16" && value >= 0 && value <= 0xFFFF)
            || (type == "uint32" && value >= 0 && value <= 0xFFFFFFFF)
            || (type == "uint64" && value >= 0 && value <= 0xFFFFFFFFFFFFFFFF)
        );
}

function lintPrimitive(type, value)
{
    return (type == "boolean" && typeof value == "boolean")
        || (type == "string" && typeof value == "string")
        || (type == "binary" && Buffer.isBuffer(value))
        || (type == "real" && typeof value == "number")
        || lintInt(type, value);
}

function lintSchema(schema)
{
    let field;
    let type;
    let keys;
    let proto;
    let struct;

    if (typeof schema != "object" || Array.isArray(schema))
        return false;

    for (let i in schema) {
        if (typeof schema[i] != "object" || Array.isArray(schema[i]))
            return false;

        for (let j in schema[i]) {
            if (typeof schema[i][j] != "object"
                || Array.isArray(schema[i][j])
                || typeof schema[i][j].description != "string"
            )
                return false;

            // if the type is object
            if (schema[i][j].fields != null) {
                if (Object.keys(schema[i][j]).sort().toString() != ["description", "fields"].sort().toString()
                    || typeof schema[i][j].fields != "object"
                )
                    return false;

                for (let k in schema[i][j].fields) {
                    field = schema[i][j].fields[k];
                    type  = field.type;
                    keys  = ["description", "nullable", "type"];

                    if (typeof field.description != "string"
                        || typeof field.nullable != "boolean"
                        || typeof type != "string"
                    )
                        return false;

                    type = type.endsWith("[]") ? type.substring(0, type.length - 2) : type;  // if the field is an array, then lint a single type
                    if (!primitives.includes(type) && type.split('.').length != 2)
                        return false;

                    // if the type is not primitive, then try to change it to its basic prototype
                    while (type.includes('.') && !type.endsWith("[]")) {
                        type = type.split('.');
                        if (typeof schema[type[0]] != "object" || typeof schema[type[0]][type[1]] != "object")
                            return false;

                        proto = schema[type[0]][type[1]];
                        if (!proto.prototype) {
                            type = type.join('.');
                            break;
                        }

                        type = proto.prototype;
                    }

                    // check if the basic prototype is a known primitive
                    if (!type.includes('.') && !primitives.includes(type.replace("[]", "")))
                        return false;

                    // if the type wasnt array, then check its default value has a correct type if it is present
                    if (!field.type.endsWith("[]") && !type.endsWith("[]") && field.default != null) {
                        keys.push("default");
                        if (!lintPrimitive(type, field.default))
                            return false;
                    }

                    if (Object.keys(field).sort().toString() != keys.sort().toString())
                        return false;
                }
            }

            // if the type is not object
            else {
                struct = schema[i][j];
                keys   = ["description", "prototype"];

                if (typeof struct.prototype != "string")
                    return false;

                // if a prototype is array, then lint a single type
                type = struct.prototype.endsWith("[]")
                    ? struct.prototype.substring(0, struct.prototype.length - 2)
                    : struct.prototype;

                if (!primitives.includes(type) && type.split('.').length != 2)
                    return false;

                // if the type is not primitive, then change it to its basic prototype
                while (type.includes('.') && !type.endsWith("[]")) {
                    type = type.split('.');
                    if (typeof schema[type[0]] != "object" || typeof schema[type[0]][type[1]] != "object")
                        return false;

                    proto = schema[type[0]][type[1]];
                    if (!proto.prototype) {
                        type = type.join('.');
                        break;
                    }

                    type = proto.prototype;
                }

                // check if the basic prototype is a known primitive
                if (!type.includes('.') && !primitives.includes(type.replace("[]", "")))
                    return false;

                // if the prototype was array, then check its min_size & max_size
                if (struct.prototype.endsWith("[]") || type.endsWith("[]")) {
                    for (let prop of ["min_size", "max_size"]) {
                        if (struct[prop] != null) {
                            keys.push(prop);

                            if (typeof struct[prop] != "number"
                                || isNaN(struct[prop])
                                || struct[prop] !== parseInt(struct[prop])
                                || struct[prop] < 0
                            )
                                return false;
                        }
                    }
                }

                // if the prototype wasnt array, then check its default, enum, pattern, min, max, min_length, max_length
                else {
                    if (struct.enum != null) {
                        keys.push("enum");
                        if (!Array.isArray(struct.enum))
                            return false;

                        for (let value of struct.enum) {
                            if (!lintPrimitive(type, value))
                                return false;
                        }
                    }

                    if (struct.pattern != null) {
                        keys.push("pattern");
                        if (struct.enum || typeof struct.pattern != "string" || type != "string")
                            return false;
                    }

                    for (let prop of ["min", "max"]) {
                        if (struct[prop] != null) {
                            keys.push(prop);
                            if (struct.enum || !lintPrimitive(type, struct[prop]))
                                return false;
                        }
                    }

                    for (let prop of ["min_length", "max_length"]) {
                        if (struct[prop] != null) {
                            keys.push(prop);
                            if (struct.enum || !["string", "binary"].includes(type))
                                return false;

                            if (typeof struct[prop] != "number"
                                || isNaN(struct[prop])
                                || struct[prop] !== parseInt(struct[prop])
                                || struct[prop] < 0
                            )
                                return false;
                        }
                    }

                    if (struct.default != null) {
                        keys.push("default");
                        if (!lintPrimitive(type, struct.default))
                            return false;

                        if (struct.enum && !struct.enum.includes(struct.default)
                            || (struct.pattern != null && !new RegExp(struct.pattern).test(struct.default))
                            || (struct.min != null && struct.min > struct.default)
                            || (struct.max != null && struct.max < struct.default)
                            || (struct.min_length != null && (
                                    Buffer.isBuffer(struct.default)
                                        ? Buffer.byteLength(struct.default) : struct.length
                                ) < struct.min_length)
                            || (struct.max_length != null && (
                                    Buffer.isBuffer(struct.default)
                                        ? Buffer.byteLength(struct.default) : struct.length
                                ) > struct.max_length)
                        )
                            return false;
                    }
                }

                // check if max < min, max_size < min_size, max_length < min_length
                if ((keys.includes("min") && keys.includes("max") && struct.max < struct.min)
                    || (keys.includes("min_size")
                        && keys.includes("max_size")
                        && struct.max_size < struct.min_size)
                    || (keys.includes("min_length")
                        && keys.includes("max_length")
                        && struct.max_length < struct.min_length)
                )
                    return false;

                if (Object.keys(struct).sort().toString() != keys.sort().toString())
                    return false;
            }
        }
    }

    return true;
}

module.exports = {
    lintPrimitive,
    lintSchema
};
