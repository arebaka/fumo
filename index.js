const LIB_NAME = "fumo";

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
        || (lintInt(type, value));
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
            if (schema[i][j].fields !== null && schema[i][j].fields !== undefined) {
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
                        if (typeof schema[type[0]][type[1]] != "object")
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
                    if (!field.type.endsWith("[]") && !type.endsWith("[]")
                        && field.default !== null && field.default !== undefined
                    ) {
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
                    ? struct.prototype.substring(0, type.length - 2)
                    : struct.prototype;

                if (!primitives.includes(type) && type.split('.').length != 2)
                    return false;

                // if the type is not primitive, then change it to its basic prototype
                while (type.includes('.') && !type.endsWith("[]")) {
                    type  = type.split('.');
                    if (!schema[type[0]][type[1]])
                        return false;

                    proto = schema[type[0]][type[1]];
                    if (!proto.prototype) {
                        type = type.join('.');
                        break;
                    }

                    type = proto.type || proto.prototype;
                }

                // check if the basic prototype is a known primitive
                if (!type.includes('.') && !primitives.includes(type.replace("[]", "")))
                    return false;

                // if the prototype was array, then check its min_size & max_size
                if (struct.prototype.endsWith("[]") || type.endsWith("[]")) {
                    for (let prop of ["min_size", "max_size"]) {
                        if (struct.min_size !== null && struct.min_size !== undefined) {
                            keys.push(prop);

                            if (typeof struct[prop] == "number"
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
                    if (struct.default !== null && struct.default !== undefined) {
                        keys.push("default");
                        if (!lintPrimitive(type, struct.default))
                            return false;
                    }

                    if (struct.enum !== null && struct.enum !== undefined) {
                        keys.push("enum");
                        if (!Array.isArray(struct.enum))
                            return false;

                        for (let value of struct.enum) {
                            if (!lintPrimitive(type, value))
                                return false;
                        }
                    }

                    if (struct.pattern !== null && struct.pattern !== undefined) {
                        keys.push("pattern");
                        if (typeof struct.pattern != "string" || type != "string")
                            return false;
                    }

                    for (let prop of ["min", "max"]) {
                        if (struct[prop] !== null && struct[prop] !== undefined) {
                            keys.push(prop);
                            if (typeof struct[prop] != "number" || !lintPrimitive(type, struct[prop]))
                                return false;
                        }
                    }

                    for (let prop of ["min_length", "max_length"]) {
                        if (struct[prop] !== null && struct[prop] !== undefined) {
                            keys.push(prop);
                            if (typeof struct[prop] != "number" || !["string", "binary"].includes(type))
                                return false;
                        }
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




class Schema
{
    constructor(schema)
    {
        if (!lintSchema(schema))
            throw libName + ": invalid_schema";

        this.schema = schema;
    }

    lint(data, type)
    {
        try {
            resolve(data, type, false);
            return true;
        }
        catch (err) {
            return false;
        }
    }

    resolve(data, type, setDefault=true)
    {
        try {
            this.resolveIter(data, type, setDefault, "");
        }
        catch (err) {
            throw LIB_NAME + ":" + err;
        }
    }

    resolveIter(data, type, setDefault, fullname)
    {
        fullname = fullname ? fullname : type;

        const tuple       = type.split('.');
        const fieldPrefix = fullname ? fullname + '.' : "";

        let struct = this.schema;
        let field;

        for (let i of tuple) {
            if (!struct[i])
                throw "no_type: " + type;

            struct = struct[i];
        }

        if (struct.fields) {
            if (typeof data != "object")
                throw "invalid_data: " + fullname;
            if (Object.keys(data).filter(f => struct.fields[f] === undefined).length)
                throw "extra_fields: " + fullname;

            for (let i in struct.fields) {
                field = struct.fields[i];
                type  = field.type;

                if (data[i] === null || data[i] === undefined) {
                    if (field.default === null || field.default === undefined) {
                        if (!field.nullable)
                            throw "null_field: " + fieldPrefix + i;

                        data[i] = setDefault ? null : data[i];
                    }
                    else {
                        data[i] = setDefault ? field.default : data[i];
                    }
                }

                if (type.endsWith("[]")) {
                    if (!Array.isArray(data[i]))
                        throw "not_array: " + fieldPrefix + i;

                    type = type.substring(0, type.length - 2);

                    for (let j = 0; j < data[i].length; j++) {
                        this.resolve(data[i][j], type, setDefault, fieldPrefix + `${i}[${j}]`);
                    }
                }
                else if (type.includes('.')) {
                    this.resolve(data[i], type, setDefault, fieldPrefix + i);
                }
                else if (!lintPrimitive(type, data[i]))
                    throw "invalid_type: " + fieldPrefix + i;
            }
        }
        else {
            if (struct.prototype.endsWith("[]")) {
                if (!Array.isArray(data))
                    throw "not_array: " + fieldPrefix;

                if (struct.min_size !== null && struct.min_size !== undefined
                    && data.length < struct.min_size
                )
                    throw "too_many: " + fieldPrefix;
                if (struct.max_size !== null && struct.max_size !== undefined
                    && data.length > struct.max_size
                )
                    throw "too_few: " + fieldPrefix;
            }
            else {
                if (struct.enum && !struct.enum.includes(data))
                    throw "invalid_value: " + fieldPrefix;
                if (typeof struct.pattern == "string" && typeof data == "string"
                    && !new RegExp(struct.pattern).test(data)
                )
                    throw "invalid_format: " + fieldPrefix;

                if (typeof struct.min == "number" && typeof data == "number" && data < struct.min)
                    throw "too_small: " + fieldPrefix;
                if (typeof struct.max == "number" && typeof data == "number" && data > struct.max)
                    throw "too_large: " + fieldPrefix;

                if (typeof struct.min_length == "number") {
                    if ((typeof data == "string" && data.length < struct.min_length)
                        || (Buffer.isBuffer(data) && Buffer.byteLength(data) < struct.min_length)
                    )
                        throw "too_short: " + fieldPrefix;
                }

                if (typeof struct.max_length == "number") {
                    if ((typeof data == "string" && data.length > struct.max_length)
                        || (Buffer.isBuffer(data) && Buffer.byteLength(data) > struct.max_length)
                    )
                        throw "too_long: " + fieldPrefix;
                }
            }

            this.resolve(data, struct.prototype, setDefault, fieldPrefix);
        }
    }
}

module.exports = {
    Schema:     Schema,
    lintSchema: lintSchema
};
