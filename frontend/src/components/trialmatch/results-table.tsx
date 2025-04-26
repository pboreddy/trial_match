'use client'

import * as React from 'react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  SortingState,
  getSortedRowModel,
} from "@tanstack/react-table"
import Link from 'next/link' // For linking NCT ID

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { RankedTrialData } from "@/lib/types"
import { ArrowUpDown } from 'lucide-react' // For sorting indicator
import { Button } from '@/components/ui/button' // For sort button

interface ResultsTableProps {
  data: RankedTrialData[]
}

// Define Columns
export const columns: ColumnDef<RankedTrialData>[] = [
  {
    accessorKey: "matchPercentage",
    header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="p-0 hover:bg-transparent"
          >
            Match %
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
    cell: ({ row }) => {
      const percentage = parseFloat(row.getValue("matchPercentage"))
      // Basic color coding example
      let textColor = "text-foreground"
      if (percentage >= 75) textColor = "text-green-600 font-medium"
      else if (percentage >= 50) textColor = "text-yellow-600"
      
      return <div className={`text-center ${textColor}`}>{percentage.toFixed(0)}%</div>
    },
    sortingFn: 'alphanumeric', // Ensure numeric sorting
  },
  {
    accessorKey: "summaryNote",
    header: "Gemini Summary Note",
    cell: ({ row }) => <div className="text-sm text-muted-foreground max-w-md whitespace-normal">{row.getValue("summaryNote")}</div>,
  },
  {
    accessorKey: "nctId",
    header: "NCT ID",
    cell: ({ row }) => {
      const nctId = row.getValue("nctId") as string
      return (
        <Link 
            href={`https://clinicaltrials.gov/study/${nctId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline font-mono text-xs"
        >
          {nctId}
        </Link>
      )
    },
  },
  // TODO: Add columns for Title, Phase, Status by merging ranked data with raw trial data if needed
]

export function ResultsTable({ data }: ResultsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'matchPercentage', desc: true }, // Default sort by Match % desc
  ])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
        sorting,
    },
  })

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
} 