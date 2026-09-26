/*
 * XStream 1.4.20 AbstractCollectionConverter with a CheerpJ fallback.
 *
 * Based on com.thoughtworks.xstream.converters.collections.AbstractCollectionConverter
 * from XStream 1.4.20 (BSD-style license, Copyright (C) 2003-2018 XStream
 * Committers / Joe Walnes). Modified: createCollection catches runtime
 * exceptions thrown by reflective instantiation (CheerpJ 4.3 throws
 * ArrayIndexOutOfBoundsException from Class.newInstance in specific GUI
 * contexts) and falls back to direct constructors for the standard
 * collection types Digital serializes.
 */
package com.thoughtworks.xstream.converters.collections;

import com.thoughtworks.xstream.converters.ConversionException;
import com.thoughtworks.xstream.converters.Converter;
import com.thoughtworks.xstream.converters.ErrorWritingException;
import com.thoughtworks.xstream.converters.MarshallingContext;
import com.thoughtworks.xstream.converters.UnmarshallingContext;
import com.thoughtworks.xstream.converters.reflection.ObjectAccessException;
import com.thoughtworks.xstream.core.util.HierarchicalStreams;
import com.thoughtworks.xstream.io.HierarchicalStreamReader;
import com.thoughtworks.xstream.io.HierarchicalStreamWriter;
import com.thoughtworks.xstream.io.ExtendedHierarchicalStreamWriterHelper;
import com.thoughtworks.xstream.mapper.Mapper;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Hashtable;
import java.util.LinkedHashMap;
import java.util.LinkedList;
import java.util.TreeMap;
import java.util.TreeSet;

public abstract class AbstractCollectionConverter implements Converter {

    private final Mapper mapper;

    public abstract boolean canConvert(Class type);

    public AbstractCollectionConverter(Mapper mapper) {
        this.mapper = mapper;
    }

    protected Mapper mapper() {
        return mapper;
    }

    public abstract void marshal(Object source, HierarchicalStreamWriter writer, MarshallingContext context);

    public abstract Object unmarshal(HierarchicalStreamReader reader, UnmarshallingContext context);

    protected void writeItem(Object item, MarshallingContext context, HierarchicalStreamWriter writer) {
        if (item == null) {
            writeNullItem(context, writer);
        } else {
            String name = mapper().serializedClass(item.getClass());
            ExtendedHierarchicalStreamWriterHelper.startNode(writer, name, item.getClass());
            writeBareItem(item, context, writer);
            writer.endNode();
        }
    }

    public void writeCompleteItem(final Object item, final MarshallingContext context,
            final HierarchicalStreamWriter writer) {
        writeItem(item, context, writer);
    }

    public void writeBareItem(final Object item, final MarshallingContext context,
            final HierarchicalStreamWriter writer) {
        context.convertAnother(item);
    }

    public void writeNullItem(final MarshallingContext context, final HierarchicalStreamWriter writer) {
        String name = mapper().serializedClass(null);
        ExtendedHierarchicalStreamWriterHelper.startNode(writer, name, Mapper.Null.class);
        writer.endNode();
    }

    protected Object readItem(final HierarchicalStreamReader reader, final UnmarshallingContext context,
            final Object current) {
        return readBareItem(reader, context, current);
    }

    public Object readBareItem(final HierarchicalStreamReader reader, final UnmarshallingContext context,
            final Object current) {
        Class type = HierarchicalStreams.readClassType(reader, mapper());
        return context.convertAnother(current, type);
    }

    public Object readCompleteItem(final HierarchicalStreamReader reader, final UnmarshallingContext context,
            final Object current) {
        reader.moveDown();
        final Object result = readItem(reader, context, current);
        reader.moveUp();
        return result;
    }

    protected Object createCollection(Class type) {
        ErrorWritingException ex = null;
        Class defaultType = mapper().defaultImplementationOf(type);
        try {
            return defaultType.newInstance();
        } catch (InstantiationException e) {
            ex =  new ConversionException("Cannot instantiate default collection", e);
        } catch (IllegalAccessException e) {
            ex = new ObjectAccessException("Cannot instantiate default collection", e);
        } catch (RuntimeException e) {
            // CheerpJ 4.3 can throw ArrayIndexOutOfBoundsException from
            // reflective instantiation in specific GUI contexts. Digital's
            // persisted circuits only use the standard collection types, so
            // fall back to their direct constructors.
            Object fallback = directCollection(defaultType);
            System.err.println("AbstractCollectionConverter: reflective instantiation of "
                + defaultType.getName() + " failed (" + e
                + "); using direct fallback: " + (fallback != null ? "yes" : "none"));
            if (fallback != null) {
                return fallback;
            }
            throw e;
        }
        ex.add("collection-type", type.getName());
        ex.add("default-type", defaultType.getName());
        throw ex;
    }

    private Object directCollection(Class type) {
        if (type == HashMap.class) return new HashMap();
        if (type == LinkedHashMap.class) return new LinkedHashMap();
        if (type == Hashtable.class) return new Hashtable();
        if (type == ArrayList.class) return new ArrayList();
        if (type == LinkedList.class) return new LinkedList();
        if (type == HashSet.class) return new HashSet();
        if (type == TreeMap.class) return new TreeMap();
        if (type == TreeSet.class) return new TreeSet();
        if (type.getName().equals("java.util.concurrent.ConcurrentHashMap")) {
            try {
                return Class.forName("java.util.concurrent.ConcurrentHashMap").getConstructor().newInstance();
            } catch (Exception e) {
                return null;
            }
        }
        return null;
    }
}
