const LIB_NAME = "fumo";

const { lintSchema, lintPrimitive } = require("./lint_schema");

class Schema
{
    constructor(schema)
    {
        if (!lintSchema(schema))
            throw LIB_NAME + ": invalid_schema";

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
        fullname = fullname || type;

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

                if (data[i] == null) {
                    if (field.default == null) {
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

                if (struct.min_size != null && data.length < struct.min_size)
                    throw "too_many: " + fieldPrefix;
                if (struct.max_size != null && data.length > struct.max_size)
                    throw "too_few: " + fieldPrefix;
            }
            else {
                if (struct.enum && !struct.enum.includes(data))
                    throw "invalid_value: " + fieldPrefix;
                if (struct.pattern != null && typeof data == "string"
                    && !new RegExp(struct.pattern).test(data)
                )
                    throw "invalid_format: " + fieldPrefix;

                if (struct.min != null && typeof data == "number" && data < struct.min)
                    throw "too_small: " + fieldPrefix;
                if (struct.max != null && typeof data == "number" && data > struct.max)
                    throw "too_large: " + fieldPrefix;

                if (struct.min_length != null) {
                    if ((typeof data == "string" && data.length < struct.min_length)
                        || Buffer.byteLength(data) < struct.min_length
                    )
                        throw "too_short: " + fieldPrefix;
                }

                if (struct.max_length != null) {
                    if ((typeof data == "string" && data.length > struct.max_length)
                        || Buffer.byteLength(data) > struct.max_length
                    )
                        throw "too_long: " + fieldPrefix;
                }
            }

            this.resolve(data, struct.prototype, setDefault, fieldPrefix);
        }
    }
}

module.exports = Schema;
